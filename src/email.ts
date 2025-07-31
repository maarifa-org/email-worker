import { extract as parseRawEmail } from 'letterparser';
import { splitEllipsis } from './splitMessage';
const PostalMime = require("postal-mime");

const DISC_MAX_LEN = 2000;

async function streamToArrayBuffer(stream, streamSize) {
  let result = new Uint8Array(streamSize);
  let bytesRead = 0;
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    result.set(value, bytesRead);
    bytesRead += value.length;
  }
  return result;
}

export async function email(message: any, env: any, ctx?: any): Promise<void> {
  const url = env.DISCORD_WEBHOOK_URL;
  if (!url) throw new Error('Missing DISCORD_WEBHOOK_URL');

  try {
    const rawEmail1 = await streamToArrayBuffer(message.raw, message.rawSize);
    const parser = new PostalMime.default();
    const parsedEmail = await parser.parse(rawEmail1);
    console.log('Mail subject: ', parsedEmail.subject);
    console.log('Mail message ID', parsedEmail.messageId);
    console.log('HTML version of Email: ', parsedEmail.html);
    console.log('Text version of Email: ', parsedEmail.text);
    if (parsedEmail.attachments.length == 0) {
      console.log('No attachments');
    } else {
      parsedEmail.attachments.forEach((att) => {
        console.log('Attachment: ', att.filename);
        console.log('Attachment disposition: ', att.disposition);
        console.log('Attachment mime type: ', att.mimeType);
        console.log('Attachment size: ', att.content.byteLength);
      });
    }
    // Parse email
    const { from, to } = message;
    const subject = message.headers.get('subject') || '(no subject)';
    // BugFix: Replace "UTF-8" with "utf-8" to prevent letterparser from throwing an error for some messages.
    // const rawEmail = (await new Response(message.raw).text()).replace(/utf-8/gi, 'utf-8');
    // const email = parseRawEmail(rawEmail);

    // Send discord message
    // const intro = `Email from ${from} to ${to} with subject "${subject}":\n\n`;
    // const [body = '(empty body)', ...rest] = splitEllipsis(email.text!, DISC_MAX_LEN, DISC_MAX_LEN - intro.length);
    // const discordMessage = [`${intro}${body}`, ...rest];
    // for (const part of discordMessage) {
    console.log(`Sending to: ${url}`);
    // console.log(`Data: ${JSON.stringify(parsedEmail, null, 2)}`)
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: parsedEmail.messageId,
        to: parsedEmail.to,
        from: parsedEmail.from,
        subject: parsedEmail.subject,
        date: parsedEmail.date,
        text: parsedEmail.text,
        html: parsedEmail.html,
        // parsedEmail,
      }),
    });
    if (!response.ok) {
      console.log('Response not ok: ' + response.status + ' ' + response.statusText);
      const contentType = response.headers.get('content-type');
      const responseData = contentType?.includes('application/json') ? await response.json() : await response.text();

      throw new Error('Failed to post message to webhook: ' + JSON.stringify(responseData));
    }

    // todo: send attachments as separate POST requests with file as body
    // if (email.attachments && email.attachments.length > 0) {
    //   console.log(Object.keys(email.attachments[0]));
    // }
    // }
  } catch (error: any) {
    console.error('Uncaught error: ' + JSON.stringify(error));

    if (error instanceof Response) {
      const contentType = error.headers.get('content-type');
      const responseData = contentType?.includes('application/json') ? await error.json() : await error.text();
      throw new Error('Request failed: ' + JSON.stringify(responseData));
    }

    throw error;
  }
}
