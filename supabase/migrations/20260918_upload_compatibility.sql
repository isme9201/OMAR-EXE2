-- توافق غرفة الرفع مع النسخ القديمة من التطبيق.
-- ينشئ أسماء عرض آمنة فوق جداول ملفات التخزين والمهام الحالية.

create or replace view public.upload_records as
select
  id,
  task_id,
  coalesce(file_name, format, 'ملف') as file_name,
  coalesce(secure_url, file_url) as public_url,
  uploaded_by,
  uploaded_at as created_at
from public.client_uploads;

grant select on public.upload_records to authenticated;

-- توافق شاشة العمليات القديمة مع جدول المهام الموحد.
create or replace view public.avenmedia_tasks as
select * from public.tasks;

grant select, insert, update, delete on public.avenmedia_tasks to authenticated;

notify pgrst, 'reload schema';
