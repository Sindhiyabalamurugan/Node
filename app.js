// Import required modules
const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');

// Create an Express application
const app = express();
const port = 3002;

// Create a MySQL connection pool
const pool = mysql.createPool({
  
    host: 127.0.0.1,
    user: 'root',
    
    password: '',
    database: 'ptgermany'
  });

// Middleware to parse incoming request bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


app.get('/', (req, res) => {
  res.send('Hello, this is a simple Express server!');
});




// Generate a secure secret key
const generateSecretKey = () => {
    return crypto.randomBytes(32).toString('hex'); // Generate 32 random bytes and convert them to hexadecimal string
};
  
const secretKey = generateSecretKey();

// Your bearer token for WhatsApp
const bearertoken = "EAAMuFo63oMABO1ULxPF3iHvO5tK2ZBTZAejjQmX74OTpoK1ImdcawTJHWTK1gBGgesxZBPEUi1q8ge2ZArck2rzniLUo09NUTh5iZA2Ge06BkmVRkov3mlLT3XoBRPP0hbg4TgjnnIKckMcWZApxAEC3fcoAbkA3FkZB26XaRxeOLUKFwTAiaYZA1ZBPYI8Bp8EmF";

app.use(express.json());

// Function to generate a random 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000);
};


/// Endpoint to send OTP
app.post("/r/sendOTP", (req, res) => {
  const fullname = req.body.name; // Change from fname to name
  const email = req.body.email;
  const mobile = req.body.mobile;
  
  const institute = req.body.institute;
  const designation = req.body.designation;

  // Check if mobile number already exists in the database
  const checkMobileQuery = `SELECT COUNT(*) AS count FROM tbl_referrer WHERE referrer_mobile = ?`;
  pool.query(checkMobileQuery, [mobile], (err, result) => { // Change from referrer_mobile to mobile
    if (err) {
      console.error('Error checking mobile number:', err);
      return res.status(500).json({ error: 'Failed to send OTP' });
    }

    const mobileExists = result[0].count > 0;

    if (mobileExists) {
      // Mobile number already exists in the database
      return res.status(400).json({ error: 'Mobile number already exists' });
    }

    // Generate OTP
    const otp = generateOTP();

    // Send OTP via WhatsApp
    axios({
      method: "post",
      url: "https://graph.facebook.com/v18.0/228667683654877/messages",
      data: {
        messaging_product: "whatsapp",
        to: "91" + mobile,
        type: "template",
        template: {
          name: "indephysio_verify",
          language: {
            code: "en"
          },
          components: [
            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  text: fullname // Change from referrer_full_name to fullname
                },
                {
                  type: "text",
                  text: otp.toString()
                }
              ]
            }
          ]
        }
      },
      headers: { Authorization: "Bearer " + bearertoken }
    })
      .then((response) => {
        // Store OTP and user details in the database
        const sql = `INSERT INTO tbl_referrer(referrer_full_name, referrer_email, referrer_mobile, referrer_otp_code, referrer_designation, referrer_institute) \
  VALUES ('${fullname}', '${email}', '${mobile}', '${otp}', '${designation}', '${institute}')`;
        pool.query(sql, (err, result) => { // Change from insertQuery to sql
          if (err) {
            console.error('Error storing OTP in database:', err);
            return res.status(500).json({ error: 'Failed to store OTP in database' });
          }
          console.log('OTP sent and stored successfully');
          res.json({ message: 'OTP sent successfully' });
        });
      })
      .catch((err) => {
        console.error('Error sending OTP:', err);
        res.status(500).json({ error: 'Failed to send OTP' });
      });
  });
});
  
  // Endpoint to validate OTP and generate token
  app.post("/r/login", (req, res) => {
    const mobile = req.body.mobile;
  
    // Check if the user exists in the physio table
    const checkUserQuery = `SELECT * FROM tbl_referrer WHERE referrer_mobile = ?;`;
    pool.query(checkUserQuery, [mobile], (err, result) => {
      if (err) {
        console.error('Error checking user existence:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
  
      if (result.length > 0) {
        // User exists, generate and send OTP
        const otp = generateOTP();
        
        // Send OTP via WhatsApp
        sendOTP(result[0].referrer_full_name, mobile, otp)
          .then(() => {
            // Update the OTP in the database
            const updateOTPQuery =` UPDATE tbl_referrer SET referrer_otp_code = ? WHERE referrer_mobile = ?;`;
            pool.query(updateOTPQuery, [otp, mobile], (err, result) => {
              if (err) {
                console.error('Error updating OTP in database:', err);
                return res.status(500).json({ error: 'Failed to generate OTP' });
              }
              console.log('OTP updated successfully');
              
              // Generate token for the user
              const payload = { mobile: mobile }; // Customize payload as needed
              const secretKey = generateSecretKey(); // Generate secret key
              const expiresIn = '1h'; // Token expiration time
              
              jwt.sign(payload, secretKey, { expiresIn }, (err, token) => {
                if (err) {
                  console.error('Error generating token:', err);
                  return res.status(500).json({ error: 'Failed to generate token' });
                }
                
                // Update token in the database
                const updateTokenQuery = `UPDATE tbl_referrer SET referrer_token = ? WHERE referrer_mobile = ?;`;
                pool.query(updateTokenQuery, [token, mobile], (err, result) => {
                  if (err) {
                    console.error('Error updating token in database:', err);
                    return res.status(500).json({ error: 'Failed to update token' });
                  }
                  
                  console.log('Token generated and updated successfully');
                  // Send the token to the client
                  res.json({ message: 'OTP sent, updated, and token generated successfully', token });
                });
              });
            });
          })
          .catch(() => {
            res.status(500).json({ error: 'Failed to send OTP' });
          });
      } else {
        // User does not exist
        res.status(404).json({ error: 'User not found' });
      }
    });
  });

// Function to send OTP via WhatsApp
const sendOTP = (name, mobile, otp) => {
    mobile = mobile.trim();
  
    return new Promise((resolve, reject) => {
      axios({
        method: "post",
        url: "https://graph.facebook.com/v18.0/228667683654877/messages",
        data: {
          messaging_product: "whatsapp",
          to: "91" + mobile,
          type: "template",
          template: {
            name: "indephysio_verify",
            language: {
              code: "en"
            },
            components: [
              {
                type: "body",
                parameters: [
                  {
                    type: "text",
                    text: name
                  },
                  {
                    type: "text",
                    text: otp.toString()
                  }
                ]
              }
            ]
          }
        },
        headers: { Authorization: "Bearer " + bearertoken }
      })
        .then((res) => {
          resolve(true); // Resolve the Promise when OTP is sent successfully
        })
        .catch((err) => {
          reject(false); // Reject the Promise if sending OTP fails
        });
    });
  };
  
  
  app.post("/r/verifyOTP", (req, res) => {
    const { mobile, otpEntered } = req.body;

    // Retrieve referrer_id associated with the user's mobile number from the database
    const retrieveReferrerIdQuery = `SELECT referrer_id FROM tbl_referrer WHERE referrer_mobile = ?;`;
    pool.query(retrieveReferrerIdQuery, [mobile], (err, result) => {
        if (err) {
            console.error('Error retrieving referrer_id from database:', err);
            return res.status(500).json({ error: 'Failed to verify OTP' });
        }

        if (result.length === 0) {
            return res.status(400).json({ error: 'No referrer_id found for the provided mobile number' });
        }

        const referrer_id = result[0].referrer_id;

        // Retrieve OTP associated with the user's mobile number from the database
        const retrieveOTPQuery = `SELECT referrer_otp_code FROM tbl_referrer WHERE referrer_mobile = ?;`;
        pool.query(retrieveOTPQuery, [mobile], (err, result) => {
            if (err) {
                console.error('Error retrieving OTP from database:', err);
                return res.status(500).json({ error: 'Failed to verify OTP' });
            }

            if (result.length === 0) {
                return res.status(400).json({ error: 'No OTP found for the provided mobile number' });
            }

            const storedOTP = result[0].referrer_otp_code;

            // Compare OTP entered by the user with the OTP stored in the database
            if (otpEntered === storedOTP) {
                // OTP is valid
                // Generate a token
                const token = generateSecretKey(); // You need to implement this function to generate a token

                // Update the token in the database
                const updateTokenQuery = `UPDATE tbl_referrer SET referrer_token = ? WHERE referrer_mobile = ?;`;
                pool.query(updateTokenQuery, [token, mobile], (err, result) => {
                    if (err) {
                        console.error('Error updating token in database:', err);
                        return res.status(500).json({ error: 'Failed to update token' });
                    }

                    // Return the token and referrer_id in the response
                    return res.json({ isValid: true, token, referrer_id });
                });
            } else {
                // OTP is invalid
                return res.json({ isValid: false, error: 'Invalid OTP' });
            }
        });
    });
});
app.get("/r/candidateStatusReport", (req, res) => {
  const { token } = req.query;

  // Verify the token first
  const verifyTokenQuery = `
    SELECT referrer_id FROM tbl_referrer WHERE referrer_token = ?;
  `;
  pool.query(verifyTokenQuery, [token], (err, result) => {
    if (err) {
      console.error('Error verifying token:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    if (result.length === 0) {
      // Token not found, unauthorized access
      return res.status(401).json({ error: 'Unauthorized access' });
    }

    // Token is valid, proceed with fetching data
    const referrerId = result[0].referrer_id;

    // Join tbl_referrer and tbl_candidate tables and count candidate_referral_id
    const countCandidatesQuery = `
      SELECT COUNT(c.candidate_referral_id) AS total_candidates
      FROM tbl_referrer r
      INNER JOIN tbl_candidate c ON r.referrer_id = c.candidate_referral_id
      WHERE r.referrer_id = ?;
    `;

    // Query to fetch referrer income
    const referrerIncomeQuery = `
      SELECT SUM(referrer_income) AS total_income
      FROM tbl_referrer_links
      WHERE referrer_id = ?;
    `;

    // Query to count registered candidates
    const registeredCandidatesQuery = `
      SELECT COUNT(*) AS registered_candidates
      FROM tbl_referrer_links
      WHERE referrer_id = ? AND is_candidate_registered = 1;
    `;
    
    // Query to count placed candidates
    const placedCandidatesQuery = `
    SELECT COUNT(c.candidate_id) AS total_placed_candidates
    FROM tbl_referrer r
    INNER JOIN tbl_candidate c ON r.referrer_id = c.candidate_referral_id
    WHERE r.referrer_id = ? AND candidate_placed = 1;
    `;

    // Execute all queries
    pool.query(countCandidatesQuery, [referrerId], (err, candidateResult) => {
      if (err) {
        console.error('Error counting candidates:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
      }

      pool.query(referrerIncomeQuery, [referrerId], (err, incomeResult) => {
        if (err) {
          console.error('Error fetching referrer income:', err);
          return res.status(500).json({ error: 'Internal Server Error' });
        }

        pool.query(registeredCandidatesQuery, [referrerId], (err, registeredResult) => {
          if (err) {
            console.error('Error counting registered candidates:', err);
            return res.status(500).json({ error: 'Internal Server Error' });
          }

          pool.query(placedCandidatesQuery, [referrerId], (err, placedResult) => {
            if (err) {
              console.error('Error counting placed candidates:', err);
              return res.status(500).json({ error: 'Internal Server Error' });
            }

            const totalCandidates = candidateResult[0].total_candidates;
            const totalIncome = incomeResult[0].total_income;
            const registeredCandidates = registeredResult[0].registered_candidates;
            const totalPlacedCandidates = placedResult[0].total_placed_candidates;

            return res.json({ totalCandidates, totalIncome, registeredCandidates, totalPlacedCandidates, referrerId });
          });
        });
      });
    });
  });
});

app.post("/r/new", (req, res) => {
  const referrer_id = req.body.referrer_id;
  const mobile = req.body.mobile;

  let digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let generatedLink = "";
  for (let i = 0; i < 8; i++) {
    generatedLink += digits[Math.floor(Math.random() * 55)];
  }

  const datetoday = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/, "");

  const sql = `insert into tbl_referrer_links(referrer_id,referrer_link,candidate_mobile_number,link_created_date,link_modified_date) 
    values(?,?,?,?,?)`;
  const data = [referrer_id, generatedLink, mobile, datetoday, datetoday];

  pool.query(sql, data, function (err, result) {
    if (err) throw err;
    console.log("Result: " + JSON.stringify(result, null, 2));
    res.json({ insertedId: result.insertId, link: generatedLink });
  });
});

app.post("/c/getlinkreferral", (req, res) => {
  const link = req.body.link;

  const sql = `select * from tbl_referrer_links where referrer_link = ? limit 1`;
  const data = [link];

  pool.query(sql, data, function (err, result) {
    if (err) throw err;
    result = JSON.parse(JSON.stringify(result));
    if (result.length > 0) {
      console.log("Result: " + JSON.stringify(result, null, 2));
      res.json({
        mobile: result[0].candidate_mobile_number,
        referrer_id: result[0].referrer_id,
        link_id: result[0].link_id
      });
    } else {
      res.json({ mobile: false });
    }
  });
});
app.post("/c/otp", (req, res) => {
  const fullname = req.body.fullname;
  const mobile = req.body.mobile;
  const otp_code = req.body.otp;

  const response = sendOTP(fullname, mobile, otp_code);
  console.log(response);
  if (response) {
    res.json({ status: true });
  } else {
    res.json({ status: false });
  }
});

app.post("/c/signup", (req, res) => {
  const fullname = req.body.fullname;
  const email = req.body.email;
  const mobile = req.body.mobile;
  const password = req.body.password;
  const otp_code = req.body.otp;
  const referrer_id = req.body.referrer_id;
  const link_id=req.body.link_id;

  const datetoday = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/, "");

  const sql = `INSERT INTO tbl_candidate(candidate_full_name,candidate_referral_id, candidate_password,candidate_email, candidate_mobile, candidate_otp_code,candidate_referral_link_id, candidate_last_login, candidate_created_date) \
      VALUES ('${fullname}',${referrer_id},'${password}', '${email}', '${mobile}', '${otp_code}','${link_id}','${datetoday}', '${datetoday}')`;

  pool.query(sql, function (err, result) {
    if (err) throw err;
    res.json({ id: result.insertId });
  });
});

app.use(bodyParser.json());

// Login endpoint for candidates
app.post('/c/login', (req, res) => {
  const { username, password } = req.body;

  // Query to retrieve candidate details along with candidate_a1_status and candidate_a2_status
  const query = `
    SELECT *
    FROM tbl_candidate 
    WHERE candidate_full_name = ? AND candidate_password = ?
  `;

  // Execute the query
  pool.query(query, [username, password], (error, results) => {
    if (error) {
      console.error("Error:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (results.length === 0) {
      // Candidate not found or invalid credentials
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Candidate authenticated successfully
    const candidate = results[0];
    const candidateDetails = {
      candidate_id: candidate.candidate_id,
      candidate_full_name: candidate.candidate_full_name,
      candidate_a1_status: candidate.candidate_a1_status,
      candidate_a2_status: candidate.candidate_a2_status,
      // Include other candidate details as needed
    };

    // Return candidate details
    res.status(200).json(candidateDetails);
  });
});

// Endpoint to fetch candidate details by ID
app.get('/candidate/:candidateId', (req, res) => {
  const candidateId = req.params.candidateId;

  const query = `
  SELECT c.*, s.candidate_a1_status, s.candidate_a2_status, s.candidate_b1_status, s.candidate_b2_status, s.candidate_document_status,s.candidate_translation_status,
  s.candidate_application_status , s.candidate_evaluation_status , s.candidate_interview_status , s.candidate_recognition_status, s.candidate_contract_status,
  s.candidate_visa_status , s.candidate_relocation_status
  FROM tbl_candidate c
  JOIN tbl_candidate_status s ON c.candidate_id = s.candidate_id
  WHERE c.candidate_id = ?
  `;

  pool.query(query, [candidateId], (error, results) => {
    if (error) {
      console.error("Error:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Candidate not found" });
    }

    const candidate = results[0];
    res.status(200).json(candidate);
  });
});

app.get('/candidates', (req, res) => {
  // Query to select all data from tbl_candidate
  const query = `SELECT * FROM tbl_candidate`;
  
  // Execute the query
  pool.query(query, (error, results, fields) => {
    if (error) {
      console.error('Error querying database:', error);
      res.status(500).send('Internal server error');
      return;
    }
    // Send the query results as the response
    res.json(results);
  });
});


// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
