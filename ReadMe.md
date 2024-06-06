## Deploy on production

```shell
# create gamelogic from gamecollections (only if prize value is changed)
npm run v2:prod gamelogic

# deploying contract on polygon
npm run compile
rm -rf deployments/base
npm run deploy base

# copy contract address & Add consumer at - https://vrf.chain.link/polygon/512 or (subscriptionId)

npm run generateABI base
npm run v2:prod add
```

## Deploy with native chain payments

- Delete `/deployments/<chain>` folder
- Add subscriptionId and x & y coords to `gameLogic.json` like in above sample
- **IMPORTANT** Save CommitX & CommitY in a safe document for later Admin interactions.
- Add Collections list in `gameCollections.json`.
- RUN `npm run ui:prod gamelogic` to add collections to gameLogic.
- Make sure that **.env** is set to correct values. Look at **.env.example**
- Add game image at `/public/game/` folder with name `0`
- Before deploying check `/contracts/Wagmi.sol` - check variables are correct.
- Deploy contracts by runnning the follwing sequence

<chain> -> bsc, bsc_testnet, polygon, polygon_testnet, goerli

```shell
# create gamelogic from gamecollections (only if prize value is changed)
npm run v2:dev gamelogic

# deploying contract on polygon
npm run compile
rm -rf deployments/<chain>
npm run deploy <chain>

# copy contract address & Add consumer at - https://vrf.chain.link/polygon/512 or (subscriptionId)

npm run generateABI <chain>
npm run v2:dev add

```

When the winner is announced for acompetition

- <https://console.firebase.google.com/project/wagmi-73408/storage/wagmi-73408.appspot.com/files/~2Fgameprodball>

and then you upload the ball picture with the competition no.
