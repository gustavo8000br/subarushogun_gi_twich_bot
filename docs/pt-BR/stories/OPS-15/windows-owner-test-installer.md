# Instalador de teste do Windows só para o dono: passo a passo

> Status: implementado, sem teste no Windows. Implementa AC-T1..AC-T7 de `windows-owner-test-installer-design.md` com as correções da nota `docs/pt-BR/research/2026-11-11-owner-test-installer-github/README.md`.
> Versão em inglês: `docs/stories/OPS-15/windows-owner-test-installer.md`.
> Não contém senha, hash, token nem URL de sessão.

## O que é

Um instalador separado do Windows, só para você. É publicado como **rascunho de pré-release** (visível só a quem tem acesso de escrita) e **se recusa a rodar sem uma senha de teste**. A senha nunca é guardada: o instalador leva só um hash PBKDF2-SHA256 (600000 iterações, sal aleatório de 16 bytes). O instalador de produção não muda: a trava só entra quando o empacotador recebe um hash.

## Passos (você)

1. **Crie o Environment** `windows-owner-test` (Settings, Environments): revisor obrigatório = você; **"Prevent self-review" DESLIGADO** (você dispara a execução e é o único revisor; ligado, você não conseguiria aprovar a própria execução); branches de implantação = só `test/windows-owner`. O `@devops` pode fazer isso com `gh api` usando o seu login de administrador.
2. **Escolha uma senha**: longa e aleatória (pelo menos 16 caracteres, ou frase com 5 palavras), **somente ASCII** (letras, dígitos, símbolos comuns; o console do Windows pode codificar acentos de outra forma). Não cole em chats nem arquivos.
3. **Gere o hash localmente**, digitando a senha oculta:
   - Node (Linux/macOS/Windows): `node apps/infra/scripts/gen-test-password-hash.mjs`
   - Windows PowerShell: `powershell -ExecutionPolicy Bypass -File apps\infra\scripts\windows\Gerar-Hash-Senha.ps1`
   Só a linha `pbkdf2-sha256$600000$<sal>$<hash>` é impressa. Os dois auxiliares geram hashes interoperáveis.
4. **Cadastre o Secret** no Environment, sem digitá-lo na linha de comando: `gh secret set TEST_INSTALLER_PASSWORD_HASH --env windows-owner-test` (ele pergunta; cole a linha do hash). Se o secret estiver vazio, o workflow aborta antes de construir.
5. **Peça ao `@devops` para iniciar a execução**: ele copia `apps/infra/test-owner/windows-owner-test-installer.yml` para `.github/workflows/` **somente na branch `test/windows-owner`** e envia um commit que **altera uma linha de `apps/infra/test-owner/RUN-MARKER`** (commit vazio não dispara a execução). Nunca abra pull request dessa branch para a `main`.
6. **Aprove a execução** na página do Actions (o job espera a sua revisão; o secret só é liberado após a aprovação).
7. **Baixe o `.bat`** (e o `.sha256`) do rascunho `test-windows-<run_id>`: `gh release download test-windows-<run_id> --repo <dono>/<repo>`. Confira com `Get-FileHash ... -Algorithm SHA256`. **Nunca publique o rascunho.**
8. **Execute no Windows.** O instalador pede `Senha de teste:` na própria janela (digitação oculta). Três tentativas erradas terminam com código de saída 4. Não digite a senha na janela do script de validação e não a envie no relatório.
9. **Limpe**: `gh release delete test-windows-<run_id> --cleanup-tag --yes`; apague a branch `test/windows-owner`; `gh secret delete TEST_INSTALLER_PASSWORD_HASH --env windows-owner-test`. Para trocar a senha, repita os passos 2 a 4.

## Limites honestos

- O hash está dentro do `.bat`: quem tem o arquivo pode tentar senhas offline. O PBKDF2 atrasa isso; a defesa real é uma senha longa e aleatória. O limite de tentativas e a pausa de 2 s são atrito, não segurança (o arquivo pode ser editado).
- Quem lê o `.bat` pode remover a trava editando-o. Ela protege contra uso acidental ou casual, não contra quem insiste.
- Protege a instalação, não a imagem: o instalador de teste baixa a mesma imagem pública da release.
- A branch e o arquivo do workflow são públicos; só o Secret e o rascunho são privados. Nenhum artefato do Actions leva o instalador (artefatos de repositórios públicos podem ser baixados por qualquer conta logada).
- O rascunho aponta para a `main` (o `GITHUB_TOKEN` não tem o escopo `workflow`, que a API exigiria para um commit que altera `.github/workflows/`); o SHA real do commit vai nas notas do rascunho. Se fosse publicado, a tag apontaria para a `main`: mais um motivo para nunca publicar.
- `SecureString` significa só ausência de eco e exposição curta; o texto puro existe brevemente na memória e strings do .NET são imutáveis. Os buffers são zerados em melhor esforço.

## O que é provado onde

| Item | Evidência |
| --- | --- |
| `.bat` de produção inalterado sem hash; trava antes de qualquer outra ação; comparação por XOR; falha fechada; contrato do workflow; sem vazamento de senha-isca | `tests/unit/windows-owner-test-installer-contract.test.js` (Node mais container `pwsh` descartável) |
| Senha certa passa, errada sai com 4 após 3 tentativas, modo silencioso/de teste/hash malformado negados, auxiliares Node e PowerShell interoperam | mesmo arquivo, container (PowerShell 7 no Linux) |
| Particularidades do Windows PowerShell 5.1: `Read-Host -AsSecureString` na janela do `.bat`, disponibilidade do construtor (.NET Framework 4.7.2+, Windows 10 1803+; builds antigos usam o fallback em C#), tempo das 600000 iterações (estimativa de 1 a 2 s, **a medir no Windows** com `Measure-Command`), interoperabilidade da senha ASCII | **só o Windows prova** (sessão do dono) |
| Verificações T-1..T-7 da nota de pesquisa (primeira execução espera revisão, bypass de admin, `--target main` aceito, acesso anônimo ao asset do rascunho e aos logs, tempo) | execuções reais do `@qa` com o dono; não comprováveis offline |
