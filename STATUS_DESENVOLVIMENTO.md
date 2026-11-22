# Estado da branch backend-iot

Esta branch preserva a ingestão IoT e consolida o módulo `ml`. A aplicação `backend/`, `frontend/`
e `shared/` foi importada seletivamente de `origin/dev`, sem merge nem alteração daquela branch.
Os READMEs dos pacotes mantêm seus contratos existentes. Não iniciar o worker MQTT legado do
backend junto do worker canônico em `worker/`.

Baseline de integração: backend typecheck e 25 testes aprovados; frontend build aprovado,
com aviso preexistente de chunks grandes. Os componentes ML ainda serão integrados nesta entrega.
Detalhes incrementais e critérios de produção: [docs/scrum](docs/scrum/SPRINTS.md).
