# PropeX Backend (Firebase Functions)
The frontend will need to read data from a firebase server, which can be emulated on the localhost.

### Note on Repository Relations
While each project should be able to run a mainnet on their own, a complete developer 
environment on the local system will need all four projects. Please complete setup of
the [smart contracts](https://github.com/) before starting this.  
Furthermore, all repositories should be within the same folder. It is best if the 
repositories related to this project are the only repositories within said folder:  
```
git-projects
    - propex
        - frontend
        - backend
        - smart-contracts
```

## Initial Setup
You will need the firebase cli and be logged into it. 
[Here's how.](https://firebase.google.com/docs/cli)  
You will need to set up credentials if you haven't done it yet. 
[Here's how.](https://firebase.google.com/docs/functions/local-emulator#set_up_admin_credentials_optional) 
Make sure that your json key path is set correctly.  
You can spin up the backend by:  
```
cd functions
npm install
firebase init emulators
npm run serve
```
Be sure to add firestore, authentication, and storage if you haven't already.  

## First Spin-Up
To start the backend locally, use `npm run serve`.  
To deploy to the staging project (credential setup required), use `firebase deploy`.  

After you spin up and make changes to the emulator database, you may desire to save the 
data for next time. To do so, run `firebase emulators:export emulator-data` within the 
*base directory*. That is, **not** the functions directory.  

To use this data, use `npm run serve:import` the next time you want to spin up.  
Alternatively, use `npm run serve:importexport` to import & automatically save the data.  

Emulator data is not stored in the repository, and should not be.  

## Using Express
It can be tricky using Express if you aren't used to it. Fortunately, the 
[docs](https://expressjs.com/en/api) are readable enough. 

### Minor Notes
You should expect emulator routes to be under 
`http://localhost:5001/propex-staging/us-central1/VERSION_NUMBER/ROUTE`.