import React, { Component } from "react";
import LoadingModal from "./LoadingModal";
import {
  sendTransactionId,
  registerUser,
  submitTweet as _submitTweet,
  getTweetVerification,
  isTweetIdAlreadyRegistered,
  zilliqa
} from "./zilliqa";
import { Link } from "react-router-dom";
const { units, BN } = require("@zilliqa-js/util");
const CP = require("@zilliqa-js/crypto");
// const privkey =
//   "7906a5bdccf93556b8f2bc326d9747ad5252a303b9e064412e32e8feadff8a08";

export default class SubmitTweet extends Component {
  constructor() {
    super();
    this.handleChange = this.handleChange.bind(this);
    this.submitTweet = this.submitTweet.bind(this);
    this.sendTransactionId = this.sendTransactionId.bind(this);
    this.updateBalance = this.updateBalance.bind(this);
    this.state = {
      tweetId: "",
      errorMsg: null,
      submittedTweet: false,
      verifiedTweet: false,
      retrievedVerification: false,
      balance: 0
    };
  }

  getPrivateKey() {
    return localStorage.getItem("privateKey");
    // return privkey;
  }

  async updateBalance() {
    const address = CP.getAddressFromPrivateKey(this.getPrivateKey());
    const data = await zilliqa.blockchain.getBalance(address);
    const { balance } = data.result;
    const zilBalance = units.fromQa(new BN(balance), units.Units.Zil);
    this.setState({ balance: zilBalance });
  }

  async sendTransactionId(txnId) {
    const { token, user } = this.props.location.state;
    // const { username } = user;
    try {
      const response = await fetch(
        "http://localhost:4000/api/v1/submit-tweet",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-auth-token": token
          },
          body: JSON.stringify({
            txnId,
            username: user.username,
            twitterToken: user.token
          })
        }
      );
      const data = await response.json();
      return data;
    } catch (e) {
      console.error(e);
      throw new Error("Failed to verify tweet. Please try again.");
    }
  }

  async submitTweet() {
    const { tweetId } = this.state;
    if (tweetId === "") {
      this.setState({ errMsg: "Tweet ID cannot be empty" });
      window.$("#loadingModal").modal("show");
      return;
    }

    if (tweetId.length < 18) {
      this.setState({
        errMsg:
          "Invalid tweet ID. Please look at instructions to see what a tweet ID is."
      });
      window.$("#loadingModal").modal("show");
      return;
    }

    // const isRegistered = await isTweetIdAlreadyRegistered();
    // if (isRegistered) {
    //   this.setState({
    //     errMsg: "Tweet ID already submitted. Please submit another tweet ID."
    //   });
    //   window.$("#loadingModal").modal("show");
    //   return;
    // }

    const privateKey = this.getPrivateKey();
    const address = CP.getAddressFromPrivateKey(privateKey);

    try {
      const modal = window
        .$("#loadingModal")
        .modal({ backdrop: "static", keyboard: false });
      const { txnId } = await _submitTweet(privateKey, tweetId);
      this.setState({ submittedTweet: true });
      const verifyTxn = await this.sendTransactionId(txnId);
      this.setState({ verifiedTweet: true });
      const verifyTxnId = verifyTxn.id;
      const tweetIsVerified = await getTweetVerification(verifyTxnId, tweetId);
      this.setState({ retrievedVerification: true });
      console.log(verifyTxn, tweetIsVerified);
    } catch (e) {
      console.error(e);
      this.setState({ errMsg: e.message });
    }
  }

  handleChange(e) {
    this.setState({ tweetId: e.target.value });
  }

  componentDidMount() {
    this.updateBalanceInterval = setInterval(() => {
      this.updateBalance();
    }, 5000);

    window.$("#loadingModal").on("hidden.bs.modal", () => {
      this.setState({
        tweetId: "",
        errorMsg: null,
        submittedTweet: false,
        verifiedTweet: false,
        retrievedVerification: false
      });
    });
  }

  componentWillUnmount() {
    clearInterval(this.updateBalanceInterval);
  }

  componentDidUpdate(prevProps, prevState) {
    const { submittedTweet, verifiedTweet, retrievedVerification } = this.state;
    if (submittedTweet && verifiedTweet && retrievedVerification) {
      // clear form
      setTimeout(() => {
        window.$("#loadingModal").modal("hide");
        this.setState({
          tweetId: "",
          errMsg: null,
          submittedTweet: false,
          verifiedTweet: false,
          retrievedVerification: false
        });
      }, 5000);
    }
  }

  render() {
    const {
      balance,
      submittedTweet,
      verifiedTweet,
      retrievedVerification,
      errMsg
    } = this.state;

    const msg = "\nPlease be patient, this will take a while.";
    let loadingPercent = 25;
    let loadingText = "Submitting tweet to contract..." + msg;

    if (submittedTweet) {
      loadingPercent = 50;
      loadingText = "Verifying tweet hashtag..." + msg;

      if (verifiedTweet) {
        loadingPercent = 75;
        loadingText = "Retrieving verification..." + msg;

        if (retrievedVerification) {
          loadingPercent = 100;
          loadingText = "Tweet is verified. Rewarded 10 ZILs!";
        }
      }
    }

    return (
      <div>
        <LoadingModal
          errorText={errMsg}
          title="Submitting tweet"
          loadingText={loadingText}
          loadingPercent={loadingPercent}
        />
        <header className="masthead-submit">
          <div className="container h-100">
            <div className="row h-100">
              <div className="balance">
                <Link to="/wallet">Balance: {balance} ZILs</Link>
              </div>
              <div className="col-lg-12 my-auto">
                <div className="header-content mx-auto">
                  <h1 className="mb-5">Enter your tweet ID</h1>
                  <h2 className="mb-6">
                    Your tweet must include the hashtag,{" "}
                    <a
                      target="_blank"
                      rel="noopener noreferrer"
                      href="https://twitter.com/intent/tweet?hashtags=BuiltWithZil&tw_p=tweetbutton&text=Hello+world&via=zilliqa"
                    >
                      #BuiltWithZil
                    </a>
                  </h2>
                  <div className="row my-auto w-100">
                    <form
                      action=""
                      className="form-inline justify-content-center w-100 mt-5"
                    >
                      <input
                        onChange={this.handleChange}
                        value={this.state.tweetId}
                        className="form-control mt-2 mb-2 mr-sm-3 pl-3"
                        type="text"
                        placeholder="1083722408815546368"
                      />
                      <div className="submit-tweet-btn shiny-button">
                        <button
                          type="button"
                          onClick={this.submitTweet}
                          className="btn shiny-button-content"
                        >
                          Submit
                        </button>
                      </div>
                    </form>
                  </div>
                  <div className="cta-container col-lg-12 text-center">
                    <a className="cta-link" href="">
                      How does this work?
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="instructions-section">
          <div className="container">
            <div className="row h-100">
              <div className="col-lg-7 mx-auto my-auto">
                <p className="heading">
                  <strong className="ml-4">Instructions</strong>
                  <ol>
                    <li>Register or Sign in with your Twitter account.</li>
                    <li>
                      Note down the private key for your blockchain wallet
                      generated for future use.
                    </li>
                    <li>
                      Tweet something with the hashtag{" "}
                      <a
                        target="_blank"
                        rel="noopener noreferrer"
                        href="https://twitter.com/intent/tweet?hashtags=BuiltWithZil&tw_p=tweetbutton&text=Hello+world&via=zilliqa"
                      >
                        #BuildWithZil
                      </a>
                      .
                    </li>
                    <li>Submit the tweet ID here for verification.</li>
                    <li>Get test tokens for our test blockchain!</li>
                  </ol>
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }
}