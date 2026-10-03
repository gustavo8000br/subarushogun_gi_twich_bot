# Identidade de versão
[English](../../fullstack-architecture/version-identity.md)


`package.json` armazena SemVer base, `.release-stage` o estágio e `VERSION` a identidade runtime completa. `apps/infra` valida/materializa prefixo exato de sete caracteres hexadecimais do commit de origem para artefatos; inicialização/verificações comuns não alteram arquivos de versão. Estado da API separa versão do produto, versão do contrato API e revisão do estado.
