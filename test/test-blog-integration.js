const chai = require('chai');
const chaiHttp = require('chai-http');
const faker = require('faker');
const mongoose = require('mongoose');

// this makes the should syntax available throughout
// this module

const should = chai.should();

const {BlogPost} = require('../models');
const {app, runServer, closeServer} = require('../server');
const {TEST_DATABASE_URL} = require('../config');

chai.use(chaiHttp);

// will use Faker library to automatically generate
// placeholder data before inserting into Mongo

function seedBlogData() {
	console.info('seeding blog post data');
	const seedData = [];

	for (let i=1; i<=10; i++) {
		seedData.push(generateBlogData());
	}

	// this will return a promise
	return BlogPost.insertMany(seedData);
}

function generateBlogData() {
	return {
		title: faker.lorem.sentence(),
		content: faker.lorem.text(),
		author: {
		 	firstName: faker.name.firstName(),
		 	lastName: faker.name.lastName()
		}
	}
}

// this function deletes entire database to ensure 
// data from one test doesn't roll over to the next

function tearDownDb() {
	console.warn('Deleting database');
	return mongoose.connection.dropDatabase();
}

describe('BlogPost API resource', function() {
 	// each before/after hook function will return 
  	// a promise

	before(function() {
		return runServer(TEST_DATABASE_URL);
	});

	beforeEach(function() {
		return seedBlogData();
	});

	afterEach(function() {
		return tearDownDb();
	});

	after(function() {
		return closeServer();
	})


	// nested 'describe' blocks allow us to make clearer
	// more discrete tests
	describe('Get endpoint', function() {

	  it('should return all existing blog posts', function() {
	  	//strategy:
	  	//	1. get back all posts returned by the GET request
	  	//	2. prove the res has the right status, and data type
	  	// 	3. prove the number of posts we got back is equal to
	  	//	   the amount of posts in the db.

	  	// need to have acces to 'res' acroos .then() calls
	  	// so it is declared globally
	  	let res;
	  	return chai.request(app)
	  	  .get('/posts')
	  	  .then(function(_res) {
	  	  	// so subsequent .then blocks can access the response object
	  	  	res = _res;
	  	  	res.should.have.status(200);
	  	  	// if data isn't greater than 1, our seeding didn't work
	  	  	res.body.should.have.length.of.at.least(1);
	  	  	return BlogPost.count();
	  	  })
	  	  .then(function(count) {
	  	  	res.body.should.have.length.of(count);
	  	  });
	  });

	  it('should return blog posts with the right fields', function() {
	  	// GET back all the blog posts and make sure they have the right keys

	  	let resBlogPost;
	  	return chai.request(app)
	  	  .get('/posts')
	  	  .then(function(res) {
	  	  	res.should.have.status(200);
	  	  	res.should.be.json;
	  	  	res.body.should.be.a('array');
	  	  	res.body.should.have.length.of.at.least(1);

	  	  	res.body.forEach(function(blogpost) {
	  	  		blogpost.should.be.a('object');
	  	  		blogpost.should.include.keys(
	  	  			'id', 'title', 'content', 'author', 'created');
	  	  	});
	  	  	resBlogPost = res.body[0];
	  	  	return BlogPost.findById(resBlogPost.id).exec();
	  	  })
	  	  .then(function(blogpost) {
	  	  	resBlogPost.title.should.equal(blogpost.title);
	  	  	resBlogPost.content.should.equal(blogpost.content);
	  	  	resBlogPost.author.should.contain(blogpost.author.firstName);
	  	  });
	  });
	});

	describe('POST endpoint', function() {
		// strategy: make a POST request with data
		// then prove response has the right keys,
		// and that it has an 'id'.  That would mean
		// the data was added to the DB
		it('should add a new blogpost', function() {
			const newBlogPost = generateBlogData();

			return chai.request(app)
				.post('/posts')
				.send(newBlogPost)
				.then(function(res) {
					res.should.have.status(201);
					res.should.be.json;
					res.body.should.be.a('object');
					res.body.should.include.keys(
						'id', 'title', 'content', 'author', 'created');
					res.body.title.should.equal(newBlogPost.title);
					res.body.id.should.not.be.null;
					res.body.author.should.equal(
            			`${newBlogPost.author.firstName} ${newBlogPost.author.lastName}`);
					res.body.content.should.equal(newBlogPost.content);

					return BlogPost.findById(res.body.id).exec();
				})
				// not 100% sure why we need this next then statement
				.then(function(blogpost) {
					blogpost.title.should.equal(newBlogPost.title);
					blogpost.content.should.equal(newBlogPost.content);
					blogpost.author.firstName.should.equal(newBlogPost.author.firstName);
					blogpost.author.lastName.should.equal(newBlogPost.author.lastName);
				});
		});
	});

	describe('PUT endpoint', function() {
		// strategy:
		// 1. Get an existing blogpost from DB
		// 2. Make a PUT request to update this blogpost
		// 3. Prove blogpost returned contains the data we sent
		// 4. Prove blogpost in DB is correctly updated
		it('should update fields you send over', function() {
			const updateData = {
				title: "fofofofofofofo",
				content: "This will be one for the ages",
				author: {
					firstName: 'foo',
					lastName: 'bar'
				}
			};

			return BlogPost
			  .findOne()
			  .exec()
			  .then(function(blogpost) {
			  	updateData.id = blogpost.id;

			  	// make request, then inspect that it reflects new data
			  	return chai.request(app)
			  	  .put(`/posts/${blogpost.id}`)
			  	  .send(updateData);
			  })
			  .then(function(res) {
			  	res.should.have.status(201);
			  	res.should.be.json;
         		res.body.should.be.a('object');
          		res.body.title.should.equal(updateData.title);
          		res.body.author.should.equal(
            		`${updateData.author.firstName} ${updateData.author.lastName}`);
          		res.body.content.should.equal(updateData.content);
			  	return BlogPost.findById(updateData.id).exec();
			  })
			  .then(function(blogpost) {
			  	blogpost.title.should.equal(updateData.title);
			  	blogpost.content.should.equal(updateData.content);
			  });
		});
	});

	describe('DELETE endpoint', function() {
		// strategy:
		// 1. GET a blogpost
		// 2. make a DELETE request based on that ID
		// 3. make sure the response has right status code
		// 4. prove blogpost deleted is not in DB anymore

		it('should delete a blogpost by id', function() {

			let blogpost;

			return BlogPost
			  .findOne()
			  .exec()
			  .then(function(_blogpost) {
			  	blogpost = _blogpost;
			  	return chai.request(app).delete(`/posts/${blogpost.id}`);
			  })
			  .then(function(res) {
			  	res.should.have.status(204);
			  	return BlogPost.findById(blogpost.id).exec();
			  })
			  .then(function(_blogpost) {
			  	// when variable's value is 'null', chaining should causes an error
			  	// this is how we are able to make an assertion about this value
			  	should.not.exist(_blogpost);
			  });
		});
	});
});