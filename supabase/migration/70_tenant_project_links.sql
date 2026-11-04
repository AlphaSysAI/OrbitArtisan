-- Les références historiques sont conservées pour revue. Les nouvelles écritures
-- ne peuvent plus rattacher une ligne à un chantier ou devis d'un autre artisan.
create unique index if not exists projects_id_artisan_unique on public.projects(id, artisan_id);
create unique index if not exists quotes_id_artisan_unique on public.quotes(id, artisan_id);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'project_time_entries_project_tenant_fk') then
    alter table public.project_time_entries add constraint project_time_entries_project_tenant_fk
      foreign key (project_id, artisan_id) references public.projects(id, artisan_id) not valid;
    alter table public.work_orders add constraint work_orders_project_tenant_fk
      foreign key (project_id, artisan_id) references public.projects(id, artisan_id) not valid;
    alter table public.work_orders add constraint work_orders_quote_tenant_fk
      foreign key (quote_id, artisan_id) references public.quotes(id, artisan_id) not valid;
    alter table public.projects add constraint projects_quote_tenant_fk
      foreign key (quote_id, artisan_id) references public.quotes(id, artisan_id) not valid;
    alter table public.quotes add constraint quotes_project_tenant_fk
      foreign key (project_id, artisan_id) references public.projects(id, artisan_id) not valid;
    alter table public.invoices add constraint invoices_quote_tenant_fk
      foreign key (quote_id, artisan_id) references public.quotes(id, artisan_id) not valid;
  end if;
end
$$;
