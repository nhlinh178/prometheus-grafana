const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());

let TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL;

if (!TEAMS_WEBHOOK_URL) {
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const rawData = fs.readFileSync(configPath);
      const config = JSON.parse(rawData);
      TEAMS_WEBHOOK_URL = config.TEAMS_WEBHOOK_URL;
    } catch (err) {
      console.error("Error reading config.json:", err);
    }
  }
}

if (!TEAMS_WEBHOOK_URL) {
  console.error("Missing TEAMS_WEBHOOK_URL config");
  process.exit(1);
}

// Hàm format alert thành Adaptive Card JSON cho alert firing
function formatAdaptiveCard(alert) {
  const startsAtUTC = new Date(alert.startsAt);
  const startsAtVN = new Date(startsAtUTC.getTime() + 7 * 60 * 60 * 1000);
  const startsAtStr = startsAtVN.toLocaleString("vi-VN");

  return {
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    "type": "AdaptiveCard",
    "version": "1.5",
    "body": [
      {
        "type": "TextBlock",
        "text": `\uD83D\uDEA8\uD83D\uDD25 CẢNH BÁO ${alert.annotations.summary} \uD83D\uDEA8\uD83D\uDD25`,
        "weight": "Bolder",
        "size": "Large",
        "color": "Attention",
        "wrap": true
      },
      {
        "type": "TextBlock",
        "text": alert.annotations.summary || alert.labels.alertname || "Alert",
        "wrap": true,
        "color": "Warning",
        "weight": "Bolder",
        "size": "Medium"
      },
      {
        "type": "TextBlock",
        "text": alert.annotations.description || "",
        "wrap": true
      },
      {
        "type": "FactSet",
        "facts": [
          {
            "title": "Severity:",
            "value": alert.labels.severity || "N/A"
          },
          {
            "title": "Started at:",
            "value": startsAtStr + " (GMT+7)"
          }
        ]
      }
    ],
    "actions": alert.generatorURL ? [
      {
        "type": "Action.OpenUrl",
        "title": "Xem chi tiết",
        "url": alert.generatorURL
      }
    ] : []
  };
}

// Hàm format adaptive card cho alert đã resolve
function formatResolvedCard(alert) {
  const endsAtUTC = new Date(alert.endsAt);
  const endsAtVN = new Date(endsAtUTC.getTime() + 7 * 60 * 60 * 1000);
  const endsAtStr = endsAtVN.toLocaleString("vi-VN");

  return {
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    "type": "AdaptiveCard",
    "version": "1.5",
    "body": [
      {
        "type": "TextBlock",
        "text": `✅ RESOLVED ${alert.annotations.summary} ✅`,
        "weight": "Bolder",
        "size": "Large",
        "color": "Good",
        "wrap": true
      },
      {
        "type": "TextBlock",
        "text": alert.annotations.description || "",
        "wrap": true
      },
      {
        "type": "FactSet",
        "facts": [
          {
            "title": "Severity:",
            "value": alert.labels.severity || "N/A"
          },
          {
            "title": "Resolved at:",
            "value": endsAtStr + " (GMT+7)"
          }
        ]
      }
    ],
    "actions": alert.generatorURL ? [
      {
        "type": "Action.OpenUrl",
        "title": "Xem chi tiết",
        "url": alert.generatorURL
      }
    ] : []
  };
}

app.post('/alertmanager', async (req, res) => {
  try {
    const alerts = req.body.alerts || [];
    for (const alert of alerts) {
      if (alert.status === "resolved") {
        const resolvedCard = formatResolvedCard(alert);
        await axios.post(TEAMS_WEBHOOK_URL, {
          type: "message",
          attachments: [
            {
              contentType: "application/vnd.microsoft.card.adaptive",
              content: resolvedCard
            }
          ]
        });
      } else {
        const card = formatAdaptiveCard(alert);
        await axios.post(TEAMS_WEBHOOK_URL, {
          type: "message",
          attachments: [
            {
              contentType: "application/vnd.microsoft.card.adaptive",
              content: card
            }
          ]
        });
      }
    }
    res.status(200).send('Alerts forwarded to MS Teams as Adaptive Cards');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error forwarding alerts');
  }
});

const PORT = process.env.PORT || 9089;
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});

