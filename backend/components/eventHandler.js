var express = require("express");
var app = express.Router();
app.use(express.json());
const models = require('../schemas.js');
const User = models.User;
const Team = models.Team;
const Event = models.Event;
const ObjectId = models.ObjectId;
const connection = models.connection;

//INTERNAL API for creating individual events
app.post("/createIndividual", async (req, res) => {
    var newEvent = new Event({
        name: req.body.name,
        description: req.body.description,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        prize: req.body.prize,
        type: "individual",
        visibility: "public"
    });
    newEvent.save()
        .then(() => {
            res.status(200).send(newEvent);
        })
        .catch(err => {
            console.log('The following error occurred in creating the newEvent: ' + err);
            res.status(500).send('Error in creating the newEvent');
        })
});


// APIs USED BY TEAM ADMINS TO CREATE TEAM EVENTS
app.post("/createPrivateTeam", async (req, res) => {
    console.log('Received createPrivateTeam POST request:');
    console.log(req.body);
    if (req.body.hostTeamId && req.body.invitedTeamId && req.body.adminId) {
        var [guestTeam, hostTeam] = await Promise.all([
            Team.findOne({ _id: ObjectId(req.body.invitedTeamId) }).exec(),
            Team.findOne({ _id: ObjectId(req.body.hostTeamId) }).exec()
        ])
        if (guestTeam && hostTeam && hostTeam.adminId == req.body.adminId) {
            var newEvent = new Event({
                name: req.body.name,
                description: req.body.description,
                startDate: req.body.startDate,
                endDate: req.body.endDate,
                type: "team",
                visibility: "private",
                hostTeam: req.body.hostTeamId,
                guestTeam: null,
                involvedTeams: [req.body.invitedTeamId]
            });
            hostTeam.activeEvents.push(newEvent._id);
            guestTeam.eventRequests.push(newEvent._id);
            connection.transaction(async (session) => {
                await Promise.all([
                    hostTeam.save({ session }),
                    guestTeam.save({ session }),
                    newEvent.save({ session })
                ])
            })
            .then(() => {
                console.log('Event created!');
                res.status(200).send(newEvent);
            })
            .catch(err => {
                console.log('The following error occurred in creating the new Private Event: ' + err);
                res.status(500).send('Error in creating the new Private Event');
            })
        } else {
            console.log('Could not find host team or guest team or admin');
            res.status(500).send('Could not find host team or guest team or admin');
        }
    } else {
        console.log('Error in creating the newEvent: missing host or guest team or adminId');
        res.status(500).send('Error in creating the newEvent: missing host or guest team or adminId');
    }
});

app.post("/createPublicTeam", async (req, res) => {
    console.log('Received createPublicTeam POST request:');
    console.log(req.body);
    if (req.body.hostTeamId && req.body.adminId) {
        var hostTeam = await Team.findOne({ _id: ObjectId(req.body.hostTeamId) }).exec();
        if (hostTeam) {
            var newEvent = new Event({
                name: req.body.name,
                description: req.body.description,
                startDate: req.body.startDate,
                endDate: req.body.endDate,
                type: "team",
                visibility: "public",
                hostTeam: req.body.hostTeamId,
                involvedTeams: [], //empty until an opponent team joins the event
                status: "pending"
            });
            hostTeam.activeEvents.push(newEvent._id);
            connection.transaction(async (session) => {
                await Promise.all([
                    hostTeam.save({ session }),
                    newEvent.save({ session })
                ])
            })
            .then(() => {
                res.status(200).send(newEvent);
            })
            .catch(err => {
                console.log('The following error occurred in creating the new Public Team Event: ' + err);
                res.status(500).send('Error in creating the new Public Team Event');
            })
        } else {
            console.log('Could not find host team or admin');
            res.status(500).send('Could not find host team or admin');
        }
    }
    else {
        console.log('Missing host team or adminId');
        res.status(500).send('Error in creating the new Public Team Event: missing host team');
    }
});


// APIs USED BY TEAM ADMINS TO MANAGE TEAM EVENTS
app.post('/enrollTeamPublic', async (req, res) => {
    console.log('Received enrollTeamPublic POST request:');
    console.log(req.body);
    if (req.body.eventId && req.body.teamId && req.body.adminId) {
        var [event, team, admin] = await Promise.all([
            Event.findOne({ _id: ObjectId(req.body.eventId) }).exec(),
            Team.findOne({ _id: ObjectId(req.body.teamId) }).exec(),
            User.findOne({ userId: req.body.adminId }).exec()
        ]);
        if (event && team && admin) {
            if (team.adminId == admin.userId) {
                if (event.visibility == "public" && event.type == "team") {
                    if (!event.involvedTeams.includes(team._id)) {
                        event.involvedTeams.push(team._id);
                        team.activeEvents.push(event._id);
                        if (event.involvedTeams.length == 1) {
                            event.involvedTeams.push(event.hostTeam); //the host team is put in the list of involved teams only if there is at least an opposing team   
                        }
                        connection.transaction(async (session) => {
                            await Promise.all([
                                event.save({ session }),
                                team.save({ session })
                            ])
                        })
                        .then(() => {
                            res.status(200).send(event);
                        })
                        .catch(err => {
                            console.log('The following error occurred in enrolling the team to the event: ' + err);
                            res.status(500).send('Error in enrolling the team to the event: ' + err);
                        })
                    } else {
                        console.log('The team is already enrolled in the event');
                        res.status(500).send('The team is already enrolled in the event');
                    }
                } else {
                    console.log('The event is not public or is not a team event');
                    res.status(500).send('The event is not public or is not a team event');
                }
            } else {
                console.log('Specified admin is not an admin of the specified team');
                res.status(500).send('Specified admin is not an admin of the specified team');
            }
        } else {
            console.log('Error in enrolling the team to the event: user, event or team not found');
            res.status(500).send('Error in enrolling the team to the event: user, event or team not found');
        }
    } else {
        console.log('Error in enrolling the team to the event: missing params');
        res.status(500).send('Error in enrolling the team to the event: missing parameters');
    }
});

app.post('/acceptPrivateTeamInvite', async (req, res) => {
    console.log('Received acceptPrivateTeamInvite POST request:');
    console.log(req.body);
    if (req.body.eventId && req.body.teamId && req.body.adminId) {
        var [event, team, admin] = await Promise.all([
            Event.findOne({ _id: ObjectId(req.body.eventId) }).exec(),
            Team.findOne({ _id: ObjectId(req.body.teamId) }).exec(),
            User.findOne({ userId: req.body.adminId }).exec()
        ]);
        if (event && team && admin) {
            if (team.adminId == admin.userId && event.visibility == "private" && event.type == "team"
            && event.involvedTeams != null && event.involvedTeams.includes(team._id) && event.guestTeam == null) {
                event.involvedTeams = null;
                event.guestTeam = team._id;
                team.eventRequests.remove(event._id);
                team.activeEvents.push(event._id);
                connection.transaction(async (session) => {
                    await Promise.all([
                        team.save({ session }),
                        event.save({ session })
                    ])
                })
                .then(() => {
                    res.status(200).send(event);
                })
                .catch(err => {
                    console.log('The following error occurred in joining the team event: ' + err);
                    res.status(500).send('Error in joining the team event');
                });
            } else {
                console.log('Conditions not matched');
                res.status(500).send('Conditions not matched');
            }
        } else {
            console.log('Error in joining the team event: event or team or admin not found');
            res.status(500).send('Error in joining the team event: event or team or admin not found'); 
        }
    } else {
        console.log('Missing params');
        res.status(500).send('Error in joining the team event: missing parameters');
    }
});

app.post('/rejectPrivateTeamInvite', async (req, res) => {
    console.log('Received rejectPrivateTeamInvite POST request:');
    console.log(req.body);
    if (req.body.eventId && req.body.teamId && req.body.adminId) {
        var [event, team, admin] = await Promise.all([
            Event.findOne({ _id: ObjectId(req.body.eventId) }).exec(),
            Team.findOne({ _id: ObjectId(req.body.teamId) }).exec(),
            User.findOne({ userId: req.body.adminId }).exec()
        ]);
        if (event && team && admin) {
            if (team.adminId == admin.userId && event.visibility == "private" && event.type == "team"
                && event.involvedTeams != null && event.involvedTeams.includes(team._id) && event.guestTeam == null) {
                event.involvedTeams = null;
                team.eventRequests.remove(event._id);
                connection.transaction(async (session) => {
                    await Promise.all([
                        team.save({ session }),
                        event.save({ session })
                    ])
                }).then(() => {
                    res.status(200).send("Invite rejected successfully");
                }
                ).catch(err => {
                    console.log('The following error occurred in rejecting the team event: ' + err);
                    res.status(500).send('Error in rejecting the team event');
                });
            } else {
                console.log('Conditions not matched');
                res.status(500).send('Conditions not matched');
            }
        } else { 
            console.log('Error in rejecting the team invite: event or team or admin not found');
            res.status(500).send('Error in rejecting the team invite: event or team or admin not found'); 
        }
    } else {
        console.log('Missing params');
        res.status(500).send('Error in rejecting the team event invite: missing parameters');
    }
});

app.post('/invitePrivateTeam', async (req, res) => {
    console.log('Received invitePrivateTeam POST request:');
    console.log(req.body);
    if (req.body.eventId && req.body.hostTeamId && req.body.adminId && req.body.invitedTeamId && req.body.invitedTeamId != req.body.hostTeamId) {
        var [event, hostTeam, guestTeam] = await Promise.all([
            Event.findOne({ _id: ObjectId(req.body.eventId) }).exec(),
            Team.findOne({ _id: ObjectId(req.body.hostTeamId) }).exec(),
            Team.findOne({ _id: ObjectId(req.body.invitedTeamId) }).exec()
        ])
        if (event && hostTeam && guestTeam) {
            if (hostTeam.adminId == req.body.adminId && event.visibility == "private" && event.type == "team" &&
                event.hostTeam.equals(hostTeam._id) && event.involvedTeams == null && event.guestTeam == null) {
                event.involvedTeams = [req.body.invitedTeamId];
                guestTeam.eventRequests.push(event._id);
                connection.transaction(async (session) => {
                    await Promise.all([
                        guestTeam.save({ session }),
                        event.save({ session })
                    ])
                })
                .then(() => {
                    res.status(200).send(event);
                })
                .catch(err => {
                    console.log('The following error occurred in inviting the team to the event: ' + err);
                    res.status(500).send('Error in inviting the team to the event');
                });
            } else {
                console.log('Conditions not matched'); 
                res.status(500).send('Error in inviting the team to the event: conditions not matched'); 
            }
        } else {
            console.log('Teams or event not found'); 
            res.status(500).send('Error in inviting the team to the event: teams or event not found'); 
        }
    } else {
        console.log('Conditions not matched');
        res.status(500).send('Error in inviting the team to the event: missing parameters'); 
    }
});



// API used by a user to join an event
app.post('/join', (req, res) => {
    console.log('Received join POST request:');
    console.log(req.body);
    const userId = req.body.userId;
    const eventId = req.body.eventId;
    const teamId = req.body.teamId;
    var scoreboardEntry;
    connection.transaction(async (session) => {
        if (!userId || !eventId)
            throw new Error('Missing userId or eventId');
        var [user, event] = await Promise.all([
            User.findOne({ userId: userId }).session(session).exec(),
            Event.findOne({ _id: eventId }).session(session).exec()
        ]);
        if (event.type == 'team') {
            if (!teamId)
                throw new Error('Missing teamId');
            var team = await Team.findOne({ _id: teamId }).session(session).exec();
            if (!team)
                throw new Error('Team not found');
            scoreboardEntry = { userId: userId, teamId: teamId, points: 0 };
        } else if (event.type == 'individual') {
            scoreboardEntry = { userId: userId, teamId: null, points: 0 };
        } else {
            throw new Error('Unknown event type');
        }
        event.scoreboard.push(scoreboardEntry);
        if (!user.joinedEvents)
            user.joinedEvents = [];
        user.joinedEvents += event._id;
        await Promise.all([
            event.save({ session: session }),
            user.save({ session: session })
        ]);
    })
    .then(() => {
        res.status(200).send('Event joined successfully');
    })
    .catch((err) => {
        console.log('Error while joining the event\n' + err);
        res.status(500).send('Error while joining the event');
    });
});

// API used by a user to leave an event
app.post('/leave', (req, res) => {
    console.log('Received leave POST request:');
    console.log(req.body);
    const userId = req.body.userId;
    const eventId = req.body.eventId;
    if (userId && eventId) {
        const user = User.findOne({ userId: userId }).exec();
        const event = Event.findOne({ _id: eventId }).exec();
        if (user && event) {
            if (user.joinedEvents.includes(eventId)) {
                user.joinedEvents.remove(eventId);
                connection.transaction(async (session) => {
                    await user.save({ session: session });
                })
                .then(() => {
                    res.status(200).send('Event left successfully');
                })
                .catch((err) => {
                    console.log('Error while leaving the event\n' + err);
                    res.status(500).send('Error while leaving the event: ' + err);
                });
            } else {
                console.log('Error while leaving the event: user is not enrolled in the event');
                res.status(500).send('Error while leaving the event: user is not enrolled in the event');
            }
        } else {
            console.log('Error while leaving the event: user or event not found');
            res.status(500).send('Error while leaving the event: user or event not found');
        }
    }
    else {
        console.log('Missing params');
        res.status(500).send('Error while leaving the event: missing parameters');
    }
});


//Team admins specify their team and the event they want to search. Empty name means all teams.
app.post('/search', async (req, res) => {
    console.log('Received search POST request');
    console.log(req.body);
    const to_search = req.body.name;
    const adminId = req.body.adminId;
    const teamId = req.body.teamId;
    if (!(to_search && adminId && teamId)) {
        console.log('Error while searching for events: missing parameters');
        res.status(500).send('Error while searching for events: missing parameters');
        return;
    }
    var [user, team] = await Promise.all([
        User.findOne({ userId: adminId }).exec(),
        Team.findOne({ _id: teamId }).exec()
    ]);
    if (!user || !team) {
        console.log('Error while searching for events: user or team not found');
        res.status(500).send('Error while searching for events: user or team not found');
        return;
    }
    if (user.userId != team.adminId) {
        console.log('Error while searching for events: user is not the team admin');
        res.status(500).send('Error while searching for events: user is not the team admin');
        return;
    }
    Event.find(
        {
            $and: [
                { name: { $regex: '.*' + to_search + ".*", $options: 'i' } },
                { _id: { $nin: team.activeEvents } }, //excludes the events team is already enrolled in
                { startDate: { $lte: new Date() } }, //excludes the events that have not started
                { endDate: { $gte: new Date() } }, //excludes the events that have already ended
                { type: 'team' },
                {
                    $or: [
                        {
                            $and: [{ visibility: 'public' }, { status: 'active' }]
                        }, //if the event is public and active
                        { involvedTeams: { $in: [teamId] } } //if the event is private and the team has been invited to join
                    ]
                }
            ]
        }, (error, events) => {
            if (error) {
                console.log('Error finding the events.\n' + error);
                res.status(500).send('Error finding the events!');
            } else {
                res.status(200).send(events);
            }
        });

});


// API used by a user to get the list of all the events that he can join
app.get('/getJoinableEvents', async (req, res) => {
    const userId = req.query.userId;
    console.log('Received getEvents GET request with param userId=' + userId);
    if (userId) {
        const user = await User.findOne({ userId: userId }).exec();
        if (user) {
            const events = await Event.find({
                $and: [
                    { _id: { $nin: user.joinedEvents } }, //excludes the events the user has already joined
                    { startDate: { $lte: new Date() } }, //excludes the events that have not started
                    { endDate: { $gte: new Date() } }, //excludes the events that have already ended
                    {
                        $or: [
                            {
                                $and: [
                                    { hostTeam: { $in: user.teams } }, //if the user is in the host team and there is a guest team that has accepted the challenge
                                    { guestTeam: { $ne: null } }
                                ]
                            },
                            { guestTeam: { $in: user.teams } }, //if the user is in the guest team of a private team event
                            {
                                $and: [ //if the user is in the involved teams of a public team event
                                    { visibility: 'public' },
                                    { type: 'team' },
                                    { involvedTeams: { $in: user.teams } }
                                ]
                            },
                            { type: "individual" } //if the event is a public individual event
                        ]
                    }
                ]
            }).exec();
            if (events) {
                res.status(200).send(events);
            } else {
                console.log('Error while getting the events');
                res.status(500).send('Error while getting the events');
            }
        } else {
            console.log('Error: User not found');
            res.status(500).send('Error: User not found');
        }
    } else {
        console.log('Error: Missing userId.');
        res.status(400).send('Error: Missing userId.');
    }

});

module.exports = { app: app };


///Old stuff
/*
app.post("/create", async (req, res) => {
    var newEvent = new Event({
        name: req.body.name,
        description: req.body.description,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        type: req.body.type,
        visibility: req.body.visibility
    });
    try {
        const eventType = req.body.type;
        if (eventType == "team") {
            const hostTeamId = req.body.hostTeam;
            if (hostTeamId) {
                const hostTeamPromise = Team.findOne({ _id: ObjectId(hostTeamId) }).exec();
                if (req.body.visibility == "private") {
                    const guestTeamId = req.body.guestTeam;
                    if (guestTeamId) {
                        await Promise.all([
                            hostTeamPromise,
                            Team.findOne({ _id: ObjectId(guestTeamId) }).exec()
                        ])
                            .catch(() => {
                                throw new Error('Impossible to find some of the specified teams');
                            })
                        newEvent.hostTeam = ObjectId(hostTeamId);
                        newEvent.guestTeam = guestTeamId;
                        //TODO SEND INVITE TO THE GUEST TEAM
                    } else
                        throw new Error('Missing guest team');
                } else if (req.body.visibility == "public") {
                    // In public team newEvents the "host" team is the team which proposes the newEvent
                    const hostTeam = await hostTeamPromise;
                    if (!hostTeam)
                        throw new Error('Impossible to find the host team');
                    newEvent.involvedTeams = [hostTeamId];
                    if (!hostTeam.activeEvents)
                        hostTeam.activeEvents = [];
                    hostTeam.activeEvents += newEvent._id
                } else {
                    throw new Error('Unknown option for newEvent visibility');
                }
            } else {
                throw new Error('Missing host team');
            }
        } else if (eventType == "individual") {
            throw new Error('Individual public newEvents can be created only by system admins');
            //newEvent.prize = req.body.prize;
        } else {
            throw new Error('Unknown event type');
        }
        newEvent.save()
            .then(() => {
                res.status(200).send(newEvent);
            })
            .catch(err => {
                console.log('The following error occurred in creating the newEvent: ' + err);
                res.status(500).send('Error in creating the newEvent');
            })
    } catch (error) {
        console.log(error);
        res.status(500).send(error);
    }
});
*/

app.post('approvePublicTeam', async (req, res) => {
    const eventId = req.body.eventId;
    if (!eventId) {
        res.status(400).send('Missing eventId');
        return;
    }
    const event = await Event.findOne({ _id: eventId }).exec();
    if (!event) {
        res.status(400).send('Event not found');
        return;
    }
    if (event.type != 'team') {
        res.status(400).send('Event is not a team event');
        return;
    }
    if (event.visibility != 'public') {
        res.status(400).send('Event is not public');
        return;
    }
    if (event.status != 'pending') {
        res.status(400).send('Event is not pending');
        return;
    }
    event.status = 'approved';
    event.save().then(() => {
        res.status(200).send(event);
    }).catch(err => {
        res.status(500).send('Error in approving the event');
    });

});

app.post('rejectPublicTeam', async (req, res) => {
    const eventId = req.body.eventId;
    if (!eventId) {
        res.status(400).send('Missing eventId');
        return;
    }
    const event = await Event.findOne({ _id: eventId }).exec();
    if (!event) {
        res.status(400).send('Event not found');
        return;
    }
    if (event.type != 'team') {
        res.status(400).send('Event is not a team event');
        return;
    }
    if (event.visibility != 'public') {
        res.status(400).send('Event is not public');
        return;
    }
    if (event.status != 'pending') {
        res.status(400).send('Event is not pending');
        return;
    }
    event.status = 'rejected';
    event.save().then(() => {
        res.status(200).send(event);
    }).catch(err => {
        res.status(500).send('Error in rejecting the event');
    });

});