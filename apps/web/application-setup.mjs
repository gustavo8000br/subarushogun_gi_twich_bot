/** @param {{request: (url: string, options: object) => Promise<any>, notice: HTMLElement, refresh: () => Promise<void>, formDataFactory?: (form: HTMLFormElement) => FormData, presentError?: (error:unknown)=>string}} dependencies */
export function createApplicationSetupSubmitHandler({ request, notice, refresh, formDataFactory, presentError = () => 'Não foi possível concluir. Tente novamente.' }) {
  return async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const clientSecretInput = form.elements.namedItem('clientSecret');
    const values = (formDataFactory ?? ((target) => new globalThis.FormData(target)))(form);
    notice.textContent = 'Validando credenciais na Twitch…';
    try {
      await request('/api/setup/application', {
        method: 'POST',
        body: JSON.stringify({ clientId: values.get('clientId'), clientSecret: values.get('clientSecret') }),
      });
      clientSecretInput.value = '';
      notice.textContent = 'Aplicativo validado e salvo com segurança.';
      await refresh();
    } catch (error) {
      notice.textContent = presentError(error);
    }
  };
}
