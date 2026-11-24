do $$ declare d text; sig text; begin
foreach sig in array array['public.set_tip_period_exclusion(date,uuid,boolean,text)','public.set_tip_history_exclusion(uuid,uuid,boolean,text)','public.save_tip_period_adjustment(date,uuid,uuid,boolean,numeric,text)'] loop
select pg_get_functiondef(sig::regprocedure) into d;
execute replace(d,'not public.is_manager_or_admin()','not exists (select 1 from public.profiles where id=auth.uid() and role in (''manager'',''admin''))');
end loop; end $$;
