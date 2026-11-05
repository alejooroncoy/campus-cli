export const commercePolicyPath = '/cancelaciones-y-devoluciones/';
export function commerceSupportHref(service, orderId = '') {
  const subject = `Campus - Solicitud de cancelación o devolución - ${service}`;
  const body = `Servicio: ${service}\n${orderId ? `Pedido: ${orderId}\n` : ''}Correo de mi cuenta Campus: \nFecha del pago: \nMotivo y solución solicitada: \n\nAdjunto la constancia del pago, si corresponde.`;
  return `mailto:info@campuscli.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
