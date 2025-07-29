const express = require('express')
const mongoose = require('mongoose')
const bodyParser = require('body-parser')
const amqp = require('amqplib')

const app = express()
const port = 3002

app.use(bodyParser.json())

mongoose.connect('mongodb://mongo:27017/tournaments')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ Could not connect to MongoDB', err))

const tournamentSchema = new mongoose.Schema({
  name: String,
  game: String,
  format: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  startDate: Date,
  endDate: Date,
  status: { type: String, default: 'upcoming' }
});

const Tournament = mongoose.model('Tournament', tournamentSchema);

let channel, connection;

async function connectToRabbitMQWithRetry(retries = 5, delay = 3000) {
  while (retries) {
    try {
      connection = await amqp.connect('amqp://rabbitmq');
      channel = await connection.createChannel();
      await channel.assertQueue('tournament_created', { durable: true });
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

app.get('/tournaments', async (req, res) => {
  const tournaments = await Tournament.find();
  res.json(tournaments);
});

app.post('/tournaments', async (req, res) => {
  try {
    const { name, game, format, userId, startDate, endDate } = req.body;

    const tournament = new Tournament({
      name,
      game,
      format,
      userId,
      startDate,
      endDate
    });

    await tournament.save();

    if (!channel) {
      return res.status(503).json({ error: 'Service Unavailable, RabbitMQ not connected' });
    }

  
    const message = {
      tournamentId: tournament._id,
      userId: tournament.userId,
      name: tournament.name,
      game: tournament.game,
      format: tournament.format,
      startDate: tournament.startDate,
      endDate: tournament.endDate,
      status: tournament.status
    };

    channel.sendToQueue('tournament_created', Buffer.from(JSON.stringify(message)), {
      persistent: true
    });

    res.status(201).json(tournament);
  } catch (error) {
    console.error('❌ Error saving tournament:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Tournament service listening on port ${port}`);
  connectToRabbitMQWithRetry();
});
