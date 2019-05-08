const express=require('express');
const bodyParser=require('body-parser');
const cors=require('cors');
const bcrypt=require('bcrypt-nodejs')
const knex=require('knex');
const Clarifai = require('clarifai');


const db=knex({
	client:'pg',
	connection:{
		connectionString:process.env.DATABASE_URL,
		ssl: true		
	}
});


const app=express();
app.use(bodyParser.json());
app.use(cors());


app.get('/',(req,res)=>{
	res.json(db.users);
})

app.post('/signin',(req,res)=>{
	const {email,password}=req.body;
	if (!email||
		email.split('').filter(x => x === '{').length === 1||		
		!password||
		password.split('').filter(x => x === '{').length === 1) {
    return res.status(400).json('wrong credentials');
  	}
	//select email and hash from the database (login)
	db.select('email','hash').from('login')
	//where email from the database = email sent from the FE
	.where('email','=',email)
	//if its true we compare the password from the FE with the password from the database
	.then(data=>{
		const isValid=bcrypt.compareSync(password,data[0].hash);
		//if the password is correct we send the usr's data to the FE
		if (isValid){
			return db.select('*').from('users')
			.where('email','=',email)
			.then(user=>{
				res.json(user[0])
			})
			.catch(err=> res.status(400).json('unable to get user'))
		}else{
			res.status(400).json('wrong credentials')
		}
		
	})
	.catch(err=> res.status(400).json('wrong credentials'))
})

app.post('/register',(req,res)=>{
	const {email,name,password}=req.body;
	//hash the password receive from the FE with bcrypt
	if (!email||
		email.split('').filter(x => x === '{').length === 1||
		!name||
		name.split('').filter(x => x === '{').length === 1||
		!password||password.split('').filter(x => x === '{').length === 1) {
    return res.status(400).json('incorrect form submission');
  	}
	const hash= bcrypt.hashSync(password);
	//insert email and password/hash to the db, Use a transaction cause we need 
	//to insert data to 2 tables (login and users) 
	db.transaction(trx=>{
		//insert data to login table
		trx.insert({
			hash:hash,
			email:email
		})
		.into('login')
		.returning('email')
		.then(loginEmail=>{
		//insert data to users table
		return trx('users')
			.returning('*')
			.insert({
				email:loginEmail[0],
				name:name,
				joined: new Date()
			})
			.then(user=>{
				//send the usr's data to the FE
				res.json(user[0])
			})
		})
		.then(trx.commit)
		.catch(trx.rollback)
	})
	
	.catch(err=>res.status(400).json('unable to register'))
})

app.get('/profile/:id',(req,res)=>{
	const {id}=req.params;
	//getting user's data from the database for the FE using id
	db.select('*').from('users').where({
		id:id
	}).then(user=>{
		//if we get an user we send to the FE user's data
		if (user.length){
			res.json(user[0])
		}else {
			res.status(400).json('not found');
		}		
	})
	.catch(err=>res.status(400).json('error getting user'))
})

const appCla = new Clarifai.App({
 apiKey: '4cca6586b2f24591af54a50c13faf688'
});

app.post('/handleApiCall',(req,res)=>{
	//getting data from clarifai api
	const {input}=req.body;
	appCla.models
    .predict(Clarifai.FACE_DETECT_MODEL,input)
    .then(data => {
      res.json(data);
    })
    .catch(err => res.status(400).json('unable to work with API'))
})


app.put('/image',(req, res)=>{
	const { id } = req.body;
	//getting and updating the number of images posted 
	db('users').where('id','=',id )
	.increment('entries',1)
	.returning('entries')
	.then(entries=>{
		res.json(entries[0])
	})
	.catch(err=>res.status(400).json('unable to get entries'))
})

app.listen(process.env.PORT||3001,()=>{
	console.log('app is running on port 3001'+'or'+process.env.PORT);
})

