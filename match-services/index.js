const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const amqp = require('amqplib');

const app = express();
const port = 3003;

app.use(bodyParser.json());

mongoose.connect('mongodb://mongo:27017/matches')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ Could not connect to MongoDB', err));

const matchSchema = new mongoose.Schema({
  tournamentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament' },
  teamA: String,
  teamB: String,
  scoreA: Number,
  scoreB: Number,
  scheduledTime: Date,
  result: { type: String, default: 'pending' }
});

const Match = mongoose.model('Match', matchSchema);

let channel, connection;

async function connectToRabbitMQWithRetry(retries = 5, delay = 3000) {
  while (retries) {
    try {
      connection = await amqp.connect('amqp://rabbitmq');
      channel = await connection.createChannel();
      await channel.assertQueue('match_created', { durable: true });
      console.log('🐇 Connected to RabbitMQ');
      return;
    } catch (error) {
      console.error(`❌ Could not connect to RabbitMQ, retries left: ${retries}`, error);
      retries -= 1;
      if (retries === 0) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

app.get('/matches', async (req, res) => {
  const matches = await Match.find();
  res.json(matches);
});

app.post('/matches', async (req, res) => {
  try {
    const { tournamentId, teamA, teamB, scheduledTime } = req.body;
    const match = new Match({ tournamentId, teamA, teamB, scheduledTime });
    await match.save();

    if (!channel) {
      return res.status(503).json({ error: 'Service Unavailable, RabbitMQ not connected' });
    }

    const message = {
      matchId: match._id,
      tournamentId: match.tournamentId,
      teamA: match.teamA,
      teamB: match.teamB,
      scheduledTime: match.scheduledTime,
      result: match.result
    };

    channel.sendToQueue('match_created', Buffer.from(JSON.stringify(message)), {
      persistent: true
    });

    res.status(201).json(match);
  } catch (error) {
    console.error('❌ Error saving match:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Match service listening on port ${port}`);
  connectToRabbitMQWithRetry();
});
