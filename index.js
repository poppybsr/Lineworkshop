'use strict';
const line = require('@line/bot-sdk');
const express = require('express');
const config = require('./config.json');
const client = new line.Client(config);
const { WebhookClient } = require('dialogflow-fulfillment');
const { handleRegister, handleRequest, handleFindLocation } = require('./fulfillment')
const { postToDialogflow, createFakeEvent, convertToDialogflow } = require('./dialogflow')
// const { Card, Suggestion } = require('dialogflow-fulfillment');

async function handleEvent(req, event) {
  switch (event.type) {
    case 'message':
      const message = event.message;
      switch (message.type) {
        case 'text':
          return handleText(req, message, event);
        case 'image':
          return handleImage(message, event);
        case 'video':
          return handleVideo(message, event);
        case 'audio':
          return handleAudio(message, event);
        case 'location':
          return handleLocation(req, message, event);
        case 'sticker':
          return handleSticker(message, event);
        default:
          throw new Error(`Unknown message: ${JSON.stringify(message)}`);
      }

    case 'follow':
      const profile = await client.getProfile(event.source.userId);
      console.log('profile', profile);
      const botInfo = await client.getBotInfo();
      console.log('botInfo', botInfo);
      const followText = `ยินดีต้อนรับคุณ ${profile.displayName} \
เข้าสู่ ${botInfo.displayName} LINE Official Account
กรุณาเลือกทำรายการที่ต้องการ`;
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: followText,
        quickReply: {
          items: [
            {
              type: 'action',
              action: {
                type: 'message',
                label: 'บริจาคเลือด',
                text: 'บริจาคเลือด'
              }
            },
            {
              type: 'action',
              action: {
                type: 'message',
                label: 'ขอบริจาคเลือด',
                text: 'ขอบริจาคเลือด'
              }
            }
          ]
        }
      });

    case 'unfollow':
      return console.log(`Unfollowed this bot: ${JSON.stringify(event)}`);

    case 'join':
      const joinText = `Joined ${event.source.type}`;
      return client.replyMessage(event.replyToken, { type: 'text', text: joinText });

    case 'leave':
      return console.log(`Left: ${JSON.stringify(event)}`);

    case 'postback':
      let data = event.postback.data;
      const postbackText = `Got postback: ${data}`;
      return client.replyMessage(event.replyToken, { type: 'text', text: postbackText });

    case 'beacon':
      const dm = `${Buffer.from(event.beacon.dm || '', 'hex').toString('utf8')}`;
      const beaconText = `${event.beacon.type} beacon hwid : ${event.beacon.hwid} with device message = ${dm}`;
      return client.replyMessage(event.replyToken, { type: 'text', text: beaconText });

    default:
      throw new Error(`Unknown event: ${JSON.stringify(event)}`);
  }
}

async function handleText(req, message, event) {
  await postToDialogflow(req);
}

async function handleImage(message, event) {
  console.log('handleImage', message)
  const stream = await client.getMessageContent(message.id)
  const fs = require('fs');
  var writeStream = fs.createWriteStream("image.png");
  stream.pipe(writeStream);
  return client.replyMessage(event.replyToken, { type: 'text', text: 'Got Image' });
}

function handleVideo(message, event) {
  return client.replyMessage(event.replyToken, { type: 'text', text: 'Got Video' });
}

function handleAudio(message, event) {
  return client.replyMessage(event.replyToken, { type: 'text', text: 'Got Audio' });
}

function handleLocation(req, message, event) {
  const msg = createFakeEvent(req, event, `Lat : ${message.latitude}, Lng : ${message.longitude}`);
  convertToDialogflow(req, msg);
}

function handleSticker(message, event) {
  return client.replyMessage(event.replyToken, { type: 'text', text: 'Got Sticker' });
}

const app = express();

app.post('/webhook', line.middleware(config), (req, res) => {
  console.log('req.body', JSON.stringify(req.body, null, 2));
  if (!Array.isArray(req.body.events)) {
    return res.status(500).end();
  }
  Promise.all(req.body.events.map(event => {
    // console.log('event', event);
    // check verify webhook event
    // if (event.source.userId === 'Udeadbeefdeadbeefdeadbeefdeadbeef') {
    //   return;
    // }
    return handleEvent(req, event);
  }))
    .then(() => res.end())
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

app.use(express.json({ limit: '50mb' }));
app.post('/fulfillment', (request, response) => {
  console.log('req.body', JSON.stringify(request.body, null, 2));

  const agent = new WebhookClient({ request, response });
  // console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  // console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

  function bodyMassIndex(agent) {
    let weight = request.body.queryResult.parameters.weight;
    let height = request.body.queryResult.parameters.height / 100;
    let bmi = (weight / (height * height)).toFixed(2);
    let result = 'ข้อมูลไม่ถูกต้อง';
    if (bmi < 18.5) {
      result = 'คุณผอมเกินไป';
    } else if (bmi < 23) {
      result = 'หุ่นกำลังดีเลย';
    } else if (bmi < 25) {
      result = 'เริ่มท้วมละนะ';
    } else if (bmi < 30) {
      result = 'คุณอ้วนแล้ว ออกกำลังกายบ้าง';
    } else {
      result = 'คุณอ้วนเกินไปแล้ว';
    }
    agent.add(result);
  }

  let intentMap = new Map();
  intentMap.set('bmi-start-info - yes', bodyMassIndex);
  intentMap.set('register - province', handleRegister);
  intentMap.set('request - province', handleRequest);
  intentMap.set('find-location - input', handleFindLocation);

  agent.handleRequest(intentMap);
});


const port = 3000;
app.listen(port, () => {
  console.log(`App is listening on port ${port}`);
});