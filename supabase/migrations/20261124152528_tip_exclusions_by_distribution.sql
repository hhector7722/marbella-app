
create schema if not exists private;
create table private.tip_period_exclusions(period_start date not null,user_id uuid not null,notes text,primary key(period_start,user_id));
create table private.tip_history_base(line_id uuid primary key references public.tip_distribution_lines(id) on delete cascade, weekday numeric not null, weekend numeric not null);
create table private.tip_history_adjustments(id bigint generated always as identity primary key,distribution_id uuid not null,user_id uuid not null,excluded boolean not null,notes text,actor uuid not null,changed_at timestamptz default now(),previous_lines jsonb not null);
alter table private.tip_period_exclusions enable row level security;
alter table private.tip_history_base enable row level security;
alter table private.tip_history_adjustments enable row level security;
revoke all on private.tip_period_exclusions,private.tip_history_base,private.tip_history_adjustments from public,anon,authenticated;
insert into private.tip_period_exclusions(period_start,user_id,notes)
select (select max(period_end)+1 from public.tip_distribution_history),o.user_id,max(o.notes) from public.tip_pool_overrides o where o.is_sanctioned group by o.user_id on conflict do nothing;
-- Preserve original amounts before sanction, including recoverable historical residuals.
insert into private.tip_history_base
select l.id,
case when l.is_sanctioned then case when s.n=1 and s.bonus>0 then greatest(0,round(h.weekday_total-s.wd,2)) else 0 end else l.weekday_amount end,
case when l.is_sanctioned then case when s.n=1 and s.bonus>0 then greatest(0,round(s.bonus-greatest(0,round(h.weekday_total-s.wd,2)),2)) else 0 end else l.weekend_amount end
from public.tip_distribution_lines l join public.tip_distribution_history h on h.id=l.distribution_id
join (select distribution_id,count(*) filter(where is_sanctioned) n,sum(weekday_amount) wd,sum(weekday_bonus+weekend_bonus) bonus from public.tip_distribution_lines group by distribution_id) s on s.distribution_id=l.distribution_id;
do $$
declare d text; old text := 'COALESCE(owd.is_sanctioned, owe.is_sanctioned, false) AS is_sanctioned';
begin
select pg_get_functiondef('public.get_tip_pool_preview(date,date)'::regprocedure) into d;
if strpos(d,old)=0 then raise exception 'preview definition changed'; end if;
execute replace(d,old,'EXISTS (SELECT 1 FROM private.tip_period_exclusions x WHERE x.period_start = p_start_date AND x.user_id = s.id) AS is_sanctioned');
select pg_get_functiondef('public.confirm_tip_distribution(date,date,text)'::regprocedure) into d;
if strpos(d,'RETURN v_distribution_id;')=0 then raise exception 'confirmation definition changed'; end if;
execute replace(d,'RETURN v_distribution_id;',$body$
INSERT INTO private.tip_history_base(line_id,weekday,weekend)
SELECT l.id, COALESCE((elem->>'shadowWeekdayAmount')::numeric,(elem->>'weekdayAmount')::numeric,0), COALESCE((elem->>'shadowWeekendAmount')::numeric,(elem->>'weekendAmount')::numeric,0)
FROM jsonb_array_elements(v_staff) elem JOIN public.tip_distribution_lines l ON l.distribution_id=v_distribution_id AND l.user_id=(elem->>'id')::uuid;
RETURN v_distribution_id;
$body$);
end $$;
create function public.set_tip_period_exclusion(p_period_start date,p_user_id uuid,p_excluded boolean,p_notes text default null) returns void language plpgsql security definer set search_path='' as $$
begin
if auth.uid() is null or not public.is_manager_or_admin() then raise exception 'PERMISSION_DENIED'; end if;
if p_period_start is distinct from (select max(period_end)+1 from public.tip_distribution_history) then raise exception 'Only the current distribution can be changed here'; end if;
if p_excluded then
insert into private.tip_period_exclusions values(p_period_start,p_user_id,p_notes) on conflict(period_start,user_id) do update set notes=excluded.notes;
else delete from private.tip_period_exclusions where period_start=p_period_start and user_id=p_user_id; end if;
end $$;
revoke all on function public.set_tip_period_exclusion(date,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.set_tip_period_exclusion(date,uuid,boolean,text) to authenticated;
create function public.set_tip_history_exclusion(p_distribution_id uuid,p_user_id uuid,p_excluded boolean,p_notes text default null) returns void language plpgsql security definer set search_path='' as $$
declare v_old boolean; v_half boolean; v_n integer; v_pool bigint;
begin
if auth.uid() is null or not public.is_manager_or_admin() then raise exception 'PERMISSION_DENIED'; end if;
perform 1 from public.tip_distribution_history where id=p_distribution_id for update;
if not found then raise exception 'Distribution not found'; end if;
select is_sanctioned into v_old from public.tip_distribution_lines where distribution_id=p_distribution_id and user_id=p_user_id;
if not found then raise exception 'Employee not in distribution'; end if;
if v_old=p_excluded then return; end if;
select bool_and(mod(total_amount*2,1)=0) into v_half from public.tip_distribution_lines where distribution_id=p_distribution_id;
-- retain original rounding mode across later corrections
select coalesce((select bool_and(mod((x->>'total_amount')::numeric*2,1)=0) from jsonb_array_elements(a.previous_lines) x),v_half) into v_half from private.tip_history_adjustments a where a.distribution_id=p_distribution_id order by a.id limit 1;
if not found then select bool_and(mod(total_amount*2,1)=0) into v_half from public.tip_distribution_lines where distribution_id=p_distribution_id; end if;
insert into private.tip_history_adjustments(distribution_id,user_id,excluded,notes,actor,previous_lines)
select p_distribution_id,p_user_id,p_excluded,p_notes,auth.uid(),jsonb_agg(to_jsonb(l)) from public.tip_distribution_lines l where distribution_id=p_distribution_id;
update public.tip_distribution_lines set is_sanctioned=p_excluded where distribution_id=p_distribution_id and user_id=p_user_id;
select count(*) filter(where not l.is_sanctioned and l.weekday_hours+l.weekend_hours>0), coalesce(round(sum(b.weekday+b.weekend) filter(where l.is_sanctioned)*100),0)::bigint into v_n,v_pool
from public.tip_distribution_lines l join private.tip_history_base b on b.line_id=l.id where l.distribution_id=p_distribution_id;
if v_n=0 and v_pool>0 then raise exception 'No eligible recipients'; end if;
with amounts as (
select l.id,l.is_sanctioned,b.weekday,b.weekend,
case when not l.is_sanctioned and l.weekday_hours+l.weekend_hours>0 and v_n>0 then (v_pool/nullif(v_n,0)+case when row_number() over(partition by (not l.is_sanctioned and l.weekday_hours+l.weekend_hours>0) order by l.user_id)<=v_pool%nullif(v_n,0) then 1 else 0 end)::numeric/100 else 0 end bonus
from public.tip_distribution_lines l join private.tip_history_base b on b.line_id=l.id where l.distribution_id=p_distribution_id
), calc as (
select *,case when weekday+weekend>0 then round(bonus*weekday/(weekday+weekend),2) else bonus end wb from amounts
)
update public.tip_distribution_lines l set weekday_amount=case when c.is_sanctioned then 0 else c.weekday end,weekend_amount=case when c.is_sanctioned then 0 else c.weekend end,weekday_bonus=c.wb,weekend_bonus=c.bonus-c.wb,total_amount=case when c.is_sanctioned then 0 when v_half then round((c.weekday+c.weekend+c.bonus)*2)/2 else c.weekday+c.weekend+c.bonus end from calc c where l.id=c.id;
end $$;
revoke all on function public.set_tip_history_exclusion(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.set_tip_history_exclusion(uuid,uuid,boolean,text) to authenticated;

