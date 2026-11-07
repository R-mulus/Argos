-- A funcao rls_auto_enable existe no projeto hospedado, mas pode nao existir em ambiente local.
-- Mantem a migracao reproduzivel sem conceder EXECUTE a usuarios comuns.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
