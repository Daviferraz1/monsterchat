import axios from 'axios';

export interface InstagramSendTextParams {
  pageId: string;
  accessToken: string;
  recipientId: string;
  text: string;
}

export interface InstagramSendMessageResponse {
  recipient_id: string;
  message_id: string;
}

export async function sendInstagramText(params: InstagramSendTextParams) {
  const url = `https://graph.facebook.com/v21.0/${params.pageId}/messages`;
  
  const response = await axios.post<InstagramSendMessageResponse>(
    url,
    {
      recipient: {
        id: params.recipientId,
      },
      message: {
        text: params.text,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  console.log('Instagram message sent:', {
    pageId: params.pageId,
    recipientId: params.recipientId,
    messageId: response.data.message_id,
  });

  return response.data;
}
