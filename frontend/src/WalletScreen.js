import React, { Component } from "react";
import { Redirect } from "react-router-dom";
const CP = require("@zilliqa-js/crypto");
const { units, BN } = require("@zilliqa-js/util");
const { zilliqa } = require("./zilliqa");

export default class Wallet extends Component {
  constructor() {
    super();
    this.privateKey = localStorage.getItem("privateKey");
    this.address = CP.getAddressFromPrivateKey(this.privateKey);
    this.updateBalance = this.updateBalance.bind(this);
  }

  async updateBalance() {
    const address = CP.getAddressFromPrivateKey(this.privateKey);
    const data = await zilliqa.blockchain.getBalance(address);
    const { balance } = data.result;
    const zilBalance = units.fromQa(new BN(balance), units.Units.Zil);
    this.setState({ balance: zilBalance });
  }

  componentDidMount() {
    this.updateBalance();

    this.updateBalanceInterval = setInterval(() => {
      this.updateBalance();
    }, 5000);
  }

  componentWillUnmount() {
    clearInterval(this.updateBalanceInterval);
  }

  render() {
    const { isAuthenticated } = this.props;

    if (!isAuthenticated) {
      return (
        <Redirect
          to={{
            pathname: "/"
          }}
        />
      );
    }

    return (
      <header className="masthead-wallet">
        <div className="container h-100">
          <div className="row h-100">
            <div className="col-lg-12 my-auto">
              <div className="header-content mx-auto">
                <div className="card">
                  <div className="card-body">
                    <h1 className="mb-5">Wallet address</h1>
                    <div>
                      <div className="row">
                        <div className="col-lg-3">Balance</div>
                        <div className="col-lg-7">20 ZIL</div>
                      </div>
                      <div className="row">
                        <div className="col-lg-3">Address</div>
                        <div className="col-lg-7">
                          <span>{this.address}</span>
                          <i className="fas fa-paste pl-2" />
                        </div>
                      </div>
                      <div className="row">
                        <div className="col-lg-3">Private Key</div>
                        <div className="col-lg-7">
                          <span>{this.privateKey}</span>
                          <i className="fas fa-paste pl-2" />
                        </div>
                      </div>
                      <div className="row">
                        <div className="col-lg-12">
                          <span className="warning">
                            Keep your private keys to yourself!
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
    );
  }
}