"use strict";

//mongoose file must be loaded before all other files in order to provide
// models to other modules
const mongoose = require("./mongoose"),
  passport = require("passport"),
  express = require("express"),
  jwt = require("jsonwebtoken"),
  expressJwt = require("express-jwt"),
  router = express.Router(),
  cors = require("cors"),
  path = require("path"),
  bodyParser = require("body-parser"),
  request = require("request");

const { promisify } = require("util");
const {
  fundAccount,
  registerUser,
  getTweetId,
  verifyTweet
} = require("./zilliqa");
const { getTweetData } = require("./twitter");

mongoose();

const User = require("mongoose").model("User");
const passportConfig = require("./passport");

//setup configuration for facebook login
passportConfig();

const app = express();

// enable cors
const corsOption = {
  origin: true,
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  exposedHeaders: ["x-auth-token"]
};
app.use(cors(corsOption));


// app.options('*', cors());
//rest API requirements
app.use(
  bodyParser.urlencoded({
    extended: true
  })
);
app.use(bodyParser.json());

router.route("/health-check").get((req, res) => {
  res.status(200);
  res.send("Hello World");
});

const createToken = (auth) => {
  return jwt.sign(
    {
      id: auth.id
    },
    "my-secret",
    {
      expiresIn: 60 * 120
    }
  );
};

const generateToken = (req, res, next) => {
  req.token = createToken(req.auth);
  return next();
};

const sendToken = (req, res) => {
  res.setHeader("x-auth-token", req.token);
  const { screen_name: username } = req.body;
  const { _id: id } = req.user;
  const { token } = req.auth;
  const payload = { username, id, token };
  return res.status(200).send(JSON.stringify(payload));
};

router.route("/auth/twitter/reverse").post((req, res) => {
  request.post(
    {
      url: "https://api.twitter.com/oauth/request_token",
      oauth: {
        // NEED TO FIND WAY TO GET 127.0.0.1:4000 by code
        callback: "http://127.0.0.1:4000/auth/twitter-callback",
        consumer_key: process.env.TWITTER_CONSUMER_KEY,
        consumer_secret: process.env.TWITTER_CONSUMER_SECRET
      }
    },
    (err, r, body) => {
      if (err) {
        return res.send(500, { message: e.message });
      }

      const jsonStr =
        '{ "' + body.replace(/&/g, '", "').replace(/=/g, '": "') + '"}';
      res.send(JSON.parse(jsonStr));
    }
  );
});

router.route('/auth/twitter-callback').get((req, res, next) => {
  console.log(req.query.oauth_token);
  console.log(req.query.oauth_verifier);
});

router.route("/auth/twitter").post(
  (req, res, next) => {
    request.post(
      {
        url: `https://api.twitter.com/oauth/access_token?oauth_verifier`,
        oauth: {
          consumer_key: process.env.TWITTER_CONSUMER_KEY,
          consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
          token: req.query.oauth_token
        },
        form: { oauth_verifier: req.query.oauth_verifier }
      },
      function(err, r, body) {
        if (err) {
          return res.send(500, { message: err.message });
        }

        const bodyString =
          '{ "' + body.replace(/&/g, '", "').replace(/=/g, '": "') + '"}';
        const parsedBody = JSON.parse(bodyString);

        req.body["oauth_token"] = parsedBody.oauth_token;
        req.body["oauth_token_secret"] = parsedBody.oauth_token_secret;
        req.body["user_id"] = parsedBody.user_id;
        req.body["screen_name"] = parsedBody.screen_name;

        next();
      }
    );
  },
  passport.authenticate("twitter-token", { session: false }),
  (req, res, next) => {
    if (!req.user) {
      return res.send(401, "User Not Authenticated");
    }
    const { id, twitterProvider } = req.user;
    const { token } = twitterProvider;

    // prepare token for API
    req.auth = {
      id,
      token
    };

    return next();
  },
  generateToken,
  sendToken
);

//token handling middleware
const authenticate = expressJwt({
  secret: "my-secret",
  requestProperty: "auth",
  getToken: (req) => {
    if (req.headers["x-auth-token"]) {
      return req.headers["x-auth-token"];
    }
    return null;
  }
});

const getCurrentUser = (req, res, next) => {
  User.findById(req.auth.id, (err, user) => {
    if (err) {
      next(err);
    } else {
      req.user = user;
      next();
    }
  });
};

const getOne = (req, res) => {
  const user = req.user.toObject();

  delete user["twitterProvider"];
  delete user["__v"];

  res.json(user);
};

const verifyTwitterToken = async (req, res, next) => {
  const { username, twitterToken } = req.body;
  const users = await User.find({
    "twitterProvider.username": username,
    "twitterProvider.token": twitterToken
  });
  if (users.length) {
    next();
  } else {
    throw new Error("Token does not exist");
  }
};

router.route("/auth/me").get(authenticate, getCurrentUser, getOne);

async function fulfillFundsRequest(req, res, next) {
  // const { userId, token, tokenSecret, address } = req.body;
  const { username, address } = req.body;

  try {
    // const user = await User.findById(userId);
    // const {
    //   token: matchToken,
    //   tokenSecret: matchTokenSecret
    // } = user.twitterProvider;
    // console.log("user", userId, token, tokenSecret);
    // console.log("match", userId, matchToken, matchTokenSecret);
    // if (token !== matchToken || tokenSecret !== matchTokenSecret) {
    //   throw new Error("Token & token secret does not match");
    // }
    console.log("funding account:", address);
    const fundReceipt = await fundAccount(address);
    // const registerReceipt = await registerUser(address, username);
    // const promises = [fundAccount(address), registerUser(address, username)];
    // const receipts = await Promise.all(promises);
    res.status(200).send(JSON.stringify(fundReceipt));
    next();
  } catch (e) {
    console.error(e);
    res.status(400).send("Not authenticated");
  }
}

router
  .route("/request-funds")
  .post(authenticate, verifyTwitterToken, fulfillFundsRequest);

const fulfillSubmitTweet = async (req, res, next) => {
  const { txnId, username, twitterToken } = req.body;

  try {
    const { tweetId, sender } = await getTweetId(txnId);

    const users = await User.find({
      "twitterProvider.username": username,
      "twitterProvider.token": twitterToken
    });
    const user = users[0];
    const tokenSecret = user.twitterProvider.tokenSecret;
    const tweetData = await getTweetData(tweetId, twitterToken, tokenSecret);
    const { tweetText, startPos, endPos } = tweetData;
    console.log(tweetData);
    console.log("verifyTweet...");
    const tx = await verifyTweet(sender, tweetId, tweetText, startPos, endPos);
    res.status(200).send(JSON.stringify(tx));
  } catch (e) {
    console.error(e);
    res.status(400).send("Tweet not valid");
  }
};

router
  .route("/submit-tweet")
  .post(authenticate, verifyTwitterToken, fulfillSubmitTweet);
// router.route("/submit-tweet").post(authenticate, fulfillSubmitTweet);

router.route("/authenticate").post(authenticate, (req, res, next) => {
  res.status(200).send(JSON.stringify("success"));
});

app.use("/", router);
app.use("/api/v1", router);

const frontendBuild = path.join(__dirname, "frontend", "build");
console.log(frontendBuild);

app.use(express.static(frontendBuild));

app.listen(4000);
module.exports = app;

console.log("Server running at http://localhost:4000/");
