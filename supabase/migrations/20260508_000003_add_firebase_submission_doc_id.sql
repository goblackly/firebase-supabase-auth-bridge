alter table public.submissions
add column if not exists firebase_doc_id text;

create unique index if not exists submissions_firebase_doc_id_idx
  on public.submissions (firebase_doc_id)
  where firebase_doc_id is not null;
