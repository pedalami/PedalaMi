var express = require('express');
var app = express.Router();
app.use(express.json());
const User = require('../schemas.js').User;

app.post('/initUser', (req, res) => {
  console.log('Received initUser POST request:');
  console.log(req.body);
  if (req.body.userId) {
    User.findOne({userId: req.body.userId}, function(err, user) {
      if (err) {
        console.log('Error checking the User existence.');
        res.status(500).send('Error finding the user.');
      }
      if (user) {
        console.log('The user already exist.');
        res.status(200).send('User already exist!');
      } else { // user doesn't exist
        const newUser = new User({ userId: req.body.userId });
        newUser.save( (error) => {
          if (error) {
            console.log('Error saving the user.');
            res.status(500).send('Error saving the user!');
          } else {
            console.log('The user has been saved.');
            res.status(200).send('User saved correctly!');
          }
        });
      }
    });
  }
});

app.get('/addPoints', (req, res) => {
  if (req.body.points <= 0) {
    res.status(500).send('Points to add cannot be negative!');
  } else {
    var query = { token: req.body.token };

    User.findOne({ token: req.body.token }).then(function (oldUser) {
      User.findOneAndUpdate(
        query,
        { points: +oldUser.points + +req.body.points },
        { upsert: true },
        function (err, doc) {
          if (err) return res.send(500, { error: err });
          return res.send('Succesfully added points.');
        }
      );
    }).catch(err => res.status(500).send({ error: err.message }));
  }
});

app.get('/removePoints', (req, res) => {
  if (req.body.points <= 0) {
    res.send('Points to subtract cannot be negative!');
  } else {
    var query = { token: req.body.token };

    User.findOne({ token: req.body.token }).then(function (oldUser) {
      if (0 > +oldUser.points - +req.body.points) {
        res.send('User Points Result cannot be negative!');
      } else {
        User.findOneAndUpdate(
          query,
          { points: +oldUser.points - +req.body.points },
          { upsert: true },
          function (err, doc) {
            if (err) return res.send(500, { error: err });
            return res.send('Succesfully removed points.');
          }
        );
      }
    }).catch(err => res.status(500).send({ error: err.message }));
  }
});

// GET /getTeams?userId=userId
app.get('/getTeams', (req, res) => {
  const userId = req.query.userId;
  console.log('Received getTeams GET request with param id=' + userId);
  if (userId) {
    User
      .aggregate([
        {
          $match: {
            uid: userId
          }
        },
        {
          $lookup: {
            from: "teams", // collection name in db
            localField: "teams", // field of User to make the lookup on (the foreign key)
            foreignField: "_id", // the referred field in teams
            as: "teams" // name that the field of the join will have in the result/JSON
          }
        }
      ])
      .exec((error, user) => {
        if (error) {
          console.log('Error finding the user.\n' + error);
          res.status(500).send('Error finding the user!');
        } else {
          res.status(200).send(user);
        }
      });
  } else {
    console.log('Error: Missing parameters.');
    res.status(400).send('Error: Missing parameters.');
  }
});

// USELESS
// GET /getStatistics?userId=userId
app.get('/getStatistics', (req, res) => {
  console.log('Received search GET request with param userId='+req.query.userId);
  if (req.query.userId) {
    User.findOne({ userId: req.query.userId }, (error, user) => {
      if (error) {
        console.log('Error finding the specified user.\n'+error);
        res.status(500).send('Error finding the specified user!');
      } else {
        res.status(200).send(user);
      }
    });
  } else {
    console.log('Error: Missing parameters.');
    res.status(400).send('Error: Missing parameters.');
  }
});

async function updateUserStatistics(ride) {
  //Calculate points
  //var points = (ride.totalKm * 100) + (ride.elevationGain * 10); //add bonus if raining later on
  //ride.points = points;
  await User.findOne({ uid: ride.userId }).then((user) => {
      if (user) {
          console.log(user);
          user.statistics.numberOfRides++;
          user.statistics.totalDuration += ride.durationInSeconds;
          user.statistics.totalKm += ride.totalKm;
          user.statistics.totalElevationGain += ride.elevationGain;
          user.statistics.averageDurationPerRide = user.statistics.totalDuration / user.statistics.numberOfRides;
          user.statistics.averageSpeed = user.statistics.totalKm / user.statistics.totalDuration;
          user.statistics.averageElevationGain = user.statistics.totalElevationGain / user.statistics.numberOfRides;
          user.save()
            .catch(err => {
            console.log(err);
            throw (err);
          });
      } else {
          throw ('The profile controller cannot update the statistics of the user specified!');
      }
  }).catch(err => {
      throw (err);
  });
}

module.exports = {
  router: app,
  updateUserStatistics: updateUserStatistics
}