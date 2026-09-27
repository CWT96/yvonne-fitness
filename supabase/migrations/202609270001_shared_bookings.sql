-- Coach-arranged shared sessions: independent appointments and existing per-member billing.
begin;
drop index if exists public.one_booking_per_slot;
create unique index if not exists one_member_booking_per_slot
 on public.appointments(slot_id,member_id) where status in ('booked','completed','no_show');
create or replace function public.manage_booking(p_action text,p_slot uuid default null,p_appointment uuid default null,p_member uuid default null,p_message text default '') returns uuid language plpgsql security definer set search_path=public as $$
declare target uuid; result uuid; existing appointments%rowtype; selected slots%rowtype; old_slot slots%rowtype; coach_id uuid; title text; notice_body text; notice_zone text; notice_location text; member_name text;
begin
 if not is_active() then raise exception '请登录有效账号'; end if;
 if length(p_message)>2000 then raise exception '留言不可超过 2000 字'; end if;
 perform pg_advisory_xact_lock(9012026);
 if p_action='book' then
  target:=coalesce(p_member,auth.uid());
  if target<>auth.uid() and not is_coach() then raise exception '无权为其他学员预约'; end if;
  if not exists(select 1 from profiles where id=target and role='member' and active) then raise exception '请选择有效学员'; end if;
 else
  select * into existing from appointments where id=p_appointment for update;
  if not found or (existing.member_id<>auth.uid() and not is_coach()) then raise exception '找不到预约或无权操作'; end if;
  if existing.status<>'booked' then raise exception '预约已取消或已完成／已标记未到场'; end if;
  select * into old_slot from slots where id=existing.slot_id;
  if old_slot.starts_at<=now() and not is_coach() then raise exception '课程已开始，请联系教练'; end if;
  target:=existing.member_id;
 end if;
 if p_action in ('book','reschedule') then
  select * into selected from slots where id=p_slot and active for update;
  if not found or selected.starts_at<=now() then raise exception '时间段不可预约'; end if;
  if p_action='reschedule' and p_slot=existing.slot_id then raise exception '请选择不同的时间段'; end if;
  -- Only coaches may explicitly add people to an occupied time. Member self-booking remains private and exclusive.
  if exists(select 1 from appointments where slot_id=p_slot and member_id=target and status in ('booked','completed','no_show')) then raise exception '这位学员已经预约了该时段'; end if;
  if not is_coach() and exists(select 1 from appointments where slot_id=p_slot and status in ('booked','completed','no_show')) then raise exception '这个时间已被预约，请选择其他时段'; end if;
  if p_action='book' then
   insert into appointments(member_id,slot_id,message,created_by) values(target,p_slot,p_message,auth.uid()) returning id into result;
   title:='预约已确认';
  else
   update appointments set slot_id=p_slot,reason=p_message where id=p_appointment returning id into result;
   title:='预约已改期';
  end if;
 elsif p_action='cancel' then
  update appointments set status='cancelled',reason=p_message where id=p_appointment returning id into result; title:='预约已取消';
 elsif p_action='complete' then
  if not is_coach() then raise exception '仅教练可确认完成'; end if;
  if old_slot.ends_at>now() then raise exception '课程结束后才能标记完成'; end if;
  update appointments set status='completed' where id=p_appointment returning id into result; title:='训练已完成';
 elsif p_action='no_show' then
  if not is_coach() then raise exception '仅教练可标记未到场'; end if;
  if old_slot.ends_at>now() then raise exception '课程结束后才能标记未到场'; end if;
  update appointments set status='no_show',reason=p_message where id=p_appointment returning id into result; title:='课程未到场（No show）';
 else raise exception '操作无效'; end if;
 insert into appointment_events(appointment_id,actor_id,action,message,details) values(result,auth.uid(),p_action,p_message,
  jsonb_build_object('old_start',old_slot.starts_at,'new_start',selected.starts_at));
 update email_jobs set state='skipped' where appointment_id=result and kind='reminder' and state in ('pending','processing');
 select id into coach_id from profiles where role='coach' and active;
 select timezone,location into notice_zone,notice_location from settings where id=1;
 select full_name into member_name from profiles where id=target;
 notice_body:='学员：' || member_name || E'\n';
 if p_action='reschedule' then
  notice_body:=notice_body || '原时间：' || public.training_time_label(old_slot.starts_at,old_slot.ends_at,notice_zone) || E'\n'
   || '新时间：' || public.training_time_label(selected.starts_at,selected.ends_at,notice_zone);
 elsif p_action='book' then
  notice_body:=notice_body || '训练时间：' || public.training_time_label(selected.starts_at,selected.ends_at,notice_zone);
 else
  notice_body:=notice_body || case when p_action='cancel' then '已取消时间：' else '训练时间：' end
   || public.training_time_label(old_slot.starts_at,old_slot.ends_at,notice_zone);
 end if;
 notice_body:=notice_body || E'\n时区：' || notice_zone || E'\n地点：' || notice_location;
 if p_action='no_show' then
  notice_body:=notice_body || E'\n结果：未到场（No show），不计入完成次数和训练时长。' || E'\n课时结算：' ||
   (select note from session_entries where appointment_id=result);
 end if;
 if nullif(trim(p_message),'') is not null then
  notice_body:=notice_body || E'\n' || case when p_action='no_show' then '缺席备注：' when p_action in ('reschedule','cancel') then '原因：' else '留言：' end || trim(p_message);
 end if;
 insert into email_jobs(recipient_id,appointment_id,subject,body) select p.id,result,title,
 notice_body from profiles p where p.id in (target,coach_id);
 if p_action in ('book','reschedule') then
  insert into email_jobs(recipient_id,appointment_id,subject,body,kind,due_at) select p.id,result,'训练提醒',
  '学员：' || member_name || E'\n训练时间：' || public.training_time_label(selected.starts_at,selected.ends_at,notice_zone) || E'\n时区：' || notice_zone || E'\n地点：' || notice_location,'reminder',greatest(now()+interval '1 minute',selected.starts_at-interval '24 hours')
  from profiles p where p.id in (target,coach_id);
 end if;
 return result;
end; $$;

create or replace function public.reschedule_new_slot(p_appointment uuid,p_start timestamptz,p_end timestamptz,p_message text default '') returns uuid language plpgsql security definer set search_path=public as $$
declare a appointments%rowtype; previous slots%rowtype; new_slot uuid;
begin
 if not is_coach() then raise exception '仅教练可操作'; end if;
 perform pg_advisory_xact_lock(9012026);
 select * into a from appointments where id=p_appointment for update;
 if not found or a.status<>'booked' then raise exception '课程不可改期'; end if;
 select * into previous from slots where id=a.slot_id for update;
 if previous.starts_at=p_start and previous.ends_at=p_end then raise exception '请选择不同的时间'; end if;
 -- When shifting within the original time, retire the old slot atomically.
 if previous.starts_at<p_end and previous.ends_at>p_start then
  if exists(select 1 from appointments where slot_id=previous.id and id<>a.id and status in ('booked','completed','no_show')) then
   raise exception '原时段还有同行学员，请选择不与原时段重叠的新时间，或先分别调整其他学员';
  end if;
  update slots set active=false where id=previous.id;
 end if;
 new_slot:=save_slot(p_start,p_end);
 return manage_booking('reschedule',new_slot,p_appointment,null,p_message);
end; $$;
revoke all on function public.reschedule_new_slot(uuid,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.reschedule_new_slot(uuid,timestamptz,timestamptz,text) to authenticated;

-- All selected members are booked in one transaction. A conflict rolls back the whole group and any new slot.
create or replace function public.book_members(
 p_members uuid[], p_slot uuid default null, p_start timestamptz default null,
 p_end timestamptz default null, p_message text default ''
) returns uuid[] language plpgsql security definer set search_path=public as $$
declare selected_slot uuid; target uuid; results uuid[] := '{}';
begin
 if not is_coach() then raise exception '仅教练可操作'; end if;
 if coalesce(cardinality(p_members),0)=0 or cardinality(p_members)>100 then raise exception '请选择 1 至 100 位学员'; end if;
 if exists(select 1 from unnest(p_members) m where m is null or not exists(select 1 from profiles where id=m and role='member' and active)) then raise exception '请选择有效学员'; end if;
 perform pg_advisory_xact_lock(9012026);
 if p_slot is not null then
  if p_start is not null or p_end is not null then raise exception '请选择已有时段或新增时间'; end if;
  selected_slot:=p_slot;
 else
  selected_slot:=save_slot(p_start,p_end);
 end if;
 for target in select distinct unnest(p_members) loop
  results:=array_append(results,manage_booking('book',selected_slot,null,target,p_message));
 end loop;
 return results;
end; $$;
revoke all on function public.book_members(uuid[],uuid,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.book_members(uuid[],uuid,timestamptz,timestamptz,text) to authenticated;
notify pgrst,'reload schema';
commit;
