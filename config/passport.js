//REQUIRE MODULES
const passport = require('passport');
const flash = require('connect-flash');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;

//PASSWORD ENCRYPTION
const bcrypt = require('bcrypt');

//USER MODEL
const models = require('../models');
const User = models.User;
const Room = models.Room;

// =========================================================================
// passport session setup ==================================================
// =========================================================================
// required for persistent login sessions
// passport needs ability to serialize and unserialize users out of session

// used to serialize the user for the session
module.exports = passport => {
  passport.serializeUser((user, next) => {
    next(null, user._id);
  });

  passport.deserializeUser((id, next) => {
    User.findById(id, (err, user) => {
      if (err) {
        return next(err);
      }
      next(null, user);
    });
  });

  passport.use(
    'local-signup',
    new LocalStrategy(
      {
        passReqToCallback: true,
      },
      (req, username, password, next) => {
        process.nextTick(() => {
          User.findOne(
            { username: username, accountType: { $ne: 'temp' } },
            (err, user) => {
              if (err) {
                return next(err);
              }
              if (user) {
                return next(null, false, 'That username is already taken.');
              } else {
                // req.body._id means we're making a temp user a permanent user
                if (req.body._id) {
                  req.body.password = bcrypt.hashSync(
                    password,
                    bcrypt.genSaltSync(12),
                    null
                  );
                  Promise.all([
                    Room.findByIdAndUpdate(req.body.rooms[0], {
                      tempRoom: false,
                      members: [{ user: req.body._id, role: 'facilitator' }],
                    }),
                    User.findByIdAndUpdate(req.body._id, req.body, {
                      new: true,
                    }),
                  ]).then(res => next(null, res[1]));
                } else {
                  var newUser = new User();
                  newUser.username = username;
                  newUser.email = req.body.email;
                  newUser.firstName = req.body.firstName;
                  newUser.lastName = req.body.lastName;
                  newUser.password = bcrypt.hashSync(
                    password,
                    bcrypt.genSaltSync(12),
                    null
                  );
                  newUser.accountType = req.body.accountType;
                  newUser.save(function(err) {
                    if (err) {
                      let keys = Object.keys(err.errors);
                      return next(null, false, err.errors[keys[0]].message);
                    }
                    return next(null, newUser);
                  });
                }
              }
            }
          );
        });
      }
    )
  );

  passport.use(
    'local-login',
    new LocalStrategy((username, password, next) => {
      User.findOne({ username, accountType: { $ne: 'temp' } })
        .populate({
          path: 'courses',
          populate: { path: 'members.user', select: 'username' },
          options: { sort: { createdAt: -1 } },
        })
        .populate({
          path: 'rooms',
          // match: { "rooms.0": "$exists" },
          select: '-currentState',
          // populate: { path: "currentMembers.user", select: "username" },
          populate: { path: 'tabs members.user', select: 'username tabType' },
          options: { sort: { createdAt: -1 } },
        })
        .populate({
          path: 'activities',
          populate: { path: 'tabs', select: 'tabType' },
          options: { sort: { createdAt: -1 } },
        })
        .populate({
          path: 'notifications',
          populate: { path: 'fromUser', select: 'username' },
        })
        // .exec()
        .then(user => {
          // console.log('TABs ON LOGIN: ', user.rooms[0].members[0]);
          // console.log('MEMBERS: ', user.rooms[0].members);
          // if (user.rooms.length > 0) {
          //   user.rooms.populate({ path: "members.user", select: "username" });
          // }
          // console.log("USER ON LOGIN: ", user.rooms[0].members);
          // @TODO we actually want to just provide a link here instead of telling htem where to go
          if (!user)
            return next(
              null,
              false,
              'That username does not exist. If you want to create an account go to Signup'
            );
          if (!bcrypt.compareSync(password, user.password)) {
            return next(null, false, 'The password you entered is incorrect');
          }
          return next(null, user);
        })
        .catch(err => {
          console.log('ERRORRRR: ', err);
          return next(err);
        });
    })
  );

  //GOOGLE STRATEGY
  // passport.use(new GoogleStrategy({
  //   clientID: process.env.CLIENT_ID,
  //   clientSecret: process.env.CLIENT_SECRET,
  //   callbackURL: "http://localhost:3000/auth/google/callback"
  // }, (accessToken, refreshToken, profile, done) => {
  //   User.findOne({
  //     googleId: profile.id
  //   }, (err, user) => {
  //     if (err) {
  //       return done(err);
  //     }
  //     if (user) {
  //       return done(null, user);
  //     }

  //     const newUser = new User({
  //       googleId: profile.id,
  //       name: profile.name.givenName + " " + profile.name.familyName,
  //       username: profile.emails[0].value,
  //       email: profile.emails[0].value,
  //       isAuthorized: true
  //     });
  //     newUser.save((err) => {
  //       if (err) {
  //         return done(err);
  //       }
  //       return done(null, newUser);
  //     });
  //   });

  // }));
};
