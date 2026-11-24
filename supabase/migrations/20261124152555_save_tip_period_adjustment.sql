create function public.save_tip_period_adjustment(p_period_start date,p_pool_id uuid,p_user_id uuid,p_excluded boolean,p_override_amount numeric,p_notes text default null) returns void language plpgsql security definer set search_path='' as $$
begin
if auth.uid() is null or not public.is_manager_or_admin() then raise exception 'PERMISSION_DENIED'; end if;
if p_override_amount<0 then raise exception 'Invalid amount'; end if;
perform public.set_tip_period_exclusion(p_period_start,p_user_id,p_excluded,p_notes);
perform public.upsert_tip_override(p_pool_id,p_user_id,null,p_override_amount,p_notes,false);
end $$;
revoke all on function public.save_tip_period_adjustment(date,uuid,uuid,boolean,numeric,text) from public,anon,authenticated;
grant execute on function public.save_tip_period_adjustment(date,uuid,uuid,boolean,numeric,text) to authenticated;
