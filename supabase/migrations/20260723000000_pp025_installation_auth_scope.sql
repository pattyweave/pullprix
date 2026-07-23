-- PP-025 exposes only the minimum database state needed to mint a short-lived
-- installation token. Tokens themselves are never stored in Postgres.

create function public.get_github_installation_auth_scope(
  p_github_installation_id bigint
)
returns table (
  github_installation_id bigint,
  repository_selection text,
  repository_ids bigint[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    installation.github_installation_id,
    installation.repository_selection,
    coalesce(
      array_agg(repository.github_repository_id order by repository.github_repository_id)
        filter (where repository.active),
      array[]::bigint[]
    ) as repository_ids
  from public.github_installations installation
  left join public.repositories repository
    on repository.installation_id = installation.id
  where installation.github_installation_id = p_github_installation_id
    and installation.status = 'active'
  group by installation.id
  having installation.repository_selection in ('all', 'selected');
$$;

revoke all on function public.get_github_installation_auth_scope(bigint) from public;
grant execute on function public.get_github_installation_auth_scope(bigint) to service_role;
