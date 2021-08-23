const express = require('express');
const expressSession = require('express-session');
const passport = require('passport');
const passportLocal = require('passport-local');
const nunjucks = require('nunjucks');
const path = require('path');
const mongodb = require('mongodb');
const pg = require('pg');
const bcrypt = require('bcrypt');
const PORT = 3000;
const BCRYPT_ROUNDS = 10;

const app = express()


const pool = new pg.Pool({
    host: '127.0.0.1',
    database: 'sem3sprint3',
    user:'postgres',
    password:'postgres',
    port: 5432
})

const URI = "mongodb+srv://dbAdmin:admin@devcluster.byo6v.mongodb.net/School?retryWrites=true&w=majority";

const client = new mongodb.MongoClient(URI);

async function mongoFetch(db,collection,query){
    await client.connect();
    const results = await client.db(`${db}`).collection(`${collection}`).find(query).toArray();
    await client.close();
    return results;
}

async function mongoStore(db,collection,data){
    await client.connect();
    await client.db(`${db}`).collection(`${collection}`).insertOne(data);
    await client.close();
    return "Successfully stored...";
}

app.use(expressSession({
    secret: 'sem3sprint3'
}));

app.use(express.urlencoded({extended:false}));
app.use(express.json())
app.use(passport.initialize())
app.use(passport.session())
app.use(express.static(path.join(__dirname, 'public')))

nunjucks.configure('views',{
    express: app
})

passport.use(new passportLocal.Strategy({
        usernameField: "username_login",
        passwordField: "password_login"
    },
    async function(username, password, done) {
        let userSearch = await mongoFetch('School','users', {username: username});

        if (userSearch.length < 1){
            return done(null, false, { message: 'No user exists with this name.' });
        }
        if (userSearch.length > 1){
            return done(null, false, { message: 'User already logged in.' });
        }
        let user = userSearch[0];
        if (await bcrypt.compare(password, user.password)) {
            return done(null, user);
        }
        return done(null, false, { message: "Incorrect password." });
        }
));

passport.serializeUser(function(user, done) {
  done(null, JSON.stringify(user)); 
});

passport.deserializeUser(function(user, done) {
  done(null, JSON.parse(user)); 
});

app.get('/', (req, res)=>{
    res.render('index.html');
})

app.post('/search', async (req, res)=>{
    if(req.isAuthenticated()){
    
        let database = req.body.database;
        let search = req.body.search;
        let username = req.user.username;
        let date = Date.now();

        await mongoStore('School', 'query_tracking', {username: username, query: search, date: date});
        
        let keywords = search.trim().split(" ");
        let queries = [];
        for (let keyword of keywords){
            queries.push(new RegExp(keyword, 'i'))
        }

        let mongoSearch = false;
        let pgSearch = false;
        let dbResults = [];
        let pgResults = [];

        if(database === "mongodb"){
            for (let query of queries){
                let results = await mongoFetch('School','job_data', {$or: [{company: query},{city: query},{contact: query},{job_opening: query}]})
                for (let r of results){
                    dbResults.push(r)
                }   
            }
            mongoSearch = true;
        }else if(database === "postgres"){
            for (let word of keywords){
                let results = await pool.query('SELECT * FROM mock_data WHERE company ~*$1 OR city ~*$1 OR job_opening ~*$1 OR contact ~*$1',[word]) 

                for (let row of results.rows){
                    pgResults.push(row)
                }   
            }
            pgSearch = true;
        }else{
            //MONGO
            for (let query of queries){
                let results = await mongoFetch('School','job_data', {$or: [{company: query},{city: query},{contact: query},{job_opening: query}]})
                for (let r of results){
                    dbResults.push(r)
                }   
            }
            //POSTGRES
            for (let word of keywords){
                let results = await pool.query('SELECT * FROM mock_data WHERE company ~*$1 OR city ~*$1 OR job_opening ~*$1 OR contact ~*$1',[word]) 
               
                for (let row of results.rows){
                    pgResults.push(row)
                }   
            }
            mongoSearch = true;
            pgSearch = true;
        }
        
        res.render('search.html', {
            mongoSearch: mongoSearch,
            pgSearch: pgSearch,
            dbResults: dbResults,
            pgResults: pgResults  
        });
           
    }else{
        res.send("You must be logged in to search. <a href='/'>Home</a>")
    } 
})


app.get('/login', (req, res)=>{
    if(req.isAuthenticated()){
        res.send("You are already logged in. <a href='/'>Home</a>")
    }else{
        res.render('login.html');
    }
    
})

app.post('/login',
  passport.authenticate('local', { successRedirect: '/',
                                   failureRedirect: '/login' }));

app.get('/logout', (req,res)=>{
    if(req.isAuthenticated()){
        req.logOut();
        res.render("logout.html");
    }else{
        res.send("Error! You're not logged in! <a href='/'>Home</a>")
    }
})

app.get('/signup', (req, res)=>{
    if(req.isAuthenticated()){
        res.send("You are already logged in. Log out to sign up a new account. <a href='/'>Home</a>")
    }else{
        res.render('signup.html');
    }
    
})

app.post('/signup', async (req, res)=>{
    let username = req.body.username;
    let password = req.body.password;

    let queryres = await mongoFetch('School', 'users', {username: username});
    if(queryres.length !== 0){
        res.send("<p>User already exists.</p><a href='/signup'>Try again</a>");
    }
    else{
        let encrypted_password = await bcrypt.hash(password, BCRYPT_ROUNDS);
        await mongoStore('School', 'users', {username: username, password: encrypted_password})
        res.send("<p>Successfully signed up.</p><a href='/'>Homepage</a>");
    }
})

app.listen(PORT, ()=>{
    console.log(`Running on http://localhost:${PORT}`);
})