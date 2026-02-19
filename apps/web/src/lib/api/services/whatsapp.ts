import axios from 'axios';

export interface WhatsAppSendTextParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  text: string;
}

export interface WhatsAppSendMessageResponse {
  messaging_product: string;
  contacts: Array<{
    input: string;
    wa_id: string;
  }>;
  messages: Array<{
    id: string;
  }>;
}

export async function sendWhatsAppText(params: WhatsAppSendTextParams) {
  const url = `https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`;
  
  const response = await axios.post<WhatsAppSendMessageResponse>(
    url,
    {
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'text',
      text: {
        body: params.text,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  console.log('WhatsApp message sent:', {
    phoneNumberId: params.phoneNumberId,
    to: params.to,
    messageId: response.data.messages[0]?.id,
  });

  return response.data;
}
