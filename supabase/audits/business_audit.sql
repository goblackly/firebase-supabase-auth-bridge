-- Read-only operator audit. Run before and after migration; no receipt URLs or member contact details.
select status, count(*) as receipts, sum(amount_spent) as total_spend from public.submissions group by status;
select extract(year from receipt_date)::integer as year, count(*) as receipts, sum(amount_spent) as approved_spend
from public.submissions where status = 'approved' group by 1 order by 1;
select regexp_replace(lower(business_name), '[^a-z0-9]', '', 'g') as suggested_name_key,
  array_agg(distinct business_name) as submitted_names, count(*) as receipts
from public.submissions group by 1 having count(distinct business_name) > 1;
select count(*) filter(where coalesce(trim(city),'')='' or coalesce(trim(state),'')='') as missing_city_or_state,
  count(*) filter(where receipt_date is null) as missing_date,
  count(*) filter(where duplicate_flag) as flagged_duplicates,
  count(*) filter(where coalesce(trim(firebase_uid),'')='') as missing_member_id
from public.submissions;
select firebase_uid,receipt_date,amount_spent,business_name,business_address,city,state,count(*) as candidate_count
from public.submissions group by 1,2,3,4,5,6,7 having count(*) > 1;
