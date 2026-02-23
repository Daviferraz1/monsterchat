# Como colocar o app da Meta em produção (sair do modo Desenvolvimento)

No **modo Desenvolvimento**, só **testadores** e outros usuários com função no app podem usar as permissões (ex.: receber mensagens que você envia pelo Instagram). Para **qualquer pessoa** poder receber suas respostas, o app precisa estar em **modo Produção (Live)**.

---

## 1. O que você precisa antes

- **App Review concluído** para as permissões que o MonsterChat usa (ex.: `instagram_manage_messages`, `whatsapp_business_messaging`, etc.). Sem isso, ao colocar em Live as permissões “avançadas” não funcionam para usuários comuns.
- **Verificação de negócio (Business Verification)**, se a Meta exigir para o seu tipo de app ou permissões.
- App estável e testado em Desenvolvimento (com testadores).

Se você ainda não passou no App Review, primeiro complete os testes de cada permissão (conforme os guias de testes no projeto) e envie o app para revisão. Só depois mude para Live.

---

## 2. Onde fica o botão (modo Produção)

1. Acesse **[developers.facebook.com](https://developers.facebook.com)** e faça login.
2. Abra o app **MonsterChat** (ou o nome do app que usa no Instagram/WhatsApp).
3. No **topo da página**, na barra do app, existe um **interruptor** (toggle) com:
   - **Desenvolvimento** (Development)  
   - **Produção** (Live)
4. Clique no interruptor e mude para **Produção** (Live).

A Meta pode pedir que você confirme que concluiu o desenvolvimento e o App Review. Se alguma permissão ainda não foi aprovada, ela não estará disponível para usuários que não são testadores.

---

## 3. Depois de colocar em Produção

- **Qualquer pessoa** que te enviar mensagem no Instagram (dentro da janela de 24h) poderá receber sua resposta, não só testadores.
- Só as **permissões e recursos aprovados no App Review** funcionam para usuários comuns; o resto continua restrito.

---

## 4. Se não conseguir mudar para Produção

Algumas causas comuns:

- **App Review pendente ou reprovado**  
  Resolva a revisão e os testes solicitados pela Meta antes de tentar de novo.

- **Verificação de negócio obrigatória**  
  Se a Meta pedir Business Verification, conclua em **Configurações da empresa** no Business Manager.

- **Políticas ou dados**  
  Verifique se não há avisos no painel (ex.: uso de dados, políticas do app) e corrija o que for pedido.

Documentação oficial: [App Modes – Meta for Developers](https://developers.facebook.com/docs/development/build-and-test/app-modes/).
