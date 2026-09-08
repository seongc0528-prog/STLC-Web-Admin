-- 온라인 결제 대신 계좌이체 안내로 단순화 — 계좌 정보를 church_info에 추가

alter table public.church_info
  add column if not exists bank_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_account_holder text;
