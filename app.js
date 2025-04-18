require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb'); // Import ObjectId
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios'); // Add axios for making HTTP requests
const multer = require('multer'); // Add multer for handling file uploads


const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Multer setup for file uploads
const upload = multer({ storage: multer.memoryStorage() });

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

let db;

(async () => {
  try {
    await client.connect();
    console.log("Connected to MongoDB");
    db = client.db('NutriTrack_db');  // Your database name
    // Ensure email is unique in the profile collection
    await db.collection('profile').createIndex({ email: 1 }, { unique: true });
    console.log("Unique index created on email field in profile collection");

  } catch (error) {
    console.error("Failed to connect to MongoDB", error);
    process.exit(1); // Exit the process if DB connection fails
  }
})();

// Routes

// Allergens GET with email filter
app.get('/api/allergens', async (req, res) => {
  const { email } = req.query;
  try {
    if (!email) {
      return res.status(400).json({ message: "Email is required to fetch allergens." });
    }
    const allergens = await db.collection('allergens').find({ email }).toArray();
    res.json(allergens);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Allergens POST
app.post('/api/allergens', async (req, res) => {
  try {
    const allergen = req.body;
    if (!allergen.email) {
      return res.status(400).json({ message: "Email is required." });
    }
    await db.collection('allergens').insertOne(allergen);
    res.status(201).json(allergen);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Allergens DELETE by ID
app.delete('/api/allergens/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate the ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid allergen ID." });
    }

    // Convert the ID to an ObjectId
    const objectId = new ObjectId(id);

    // Delete the allergen from the database
    const result = await db.collection('allergens').deleteOne({ _id: objectId });

    // Check if the allergen was found and deleted
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Allergen not found." });
    }

    // Return success response
    res.status(200).json({ message: "Allergen deleted successfully." });
  } catch (error) {
    console.error('Error deleting allergen:', error);
    res.status(500).json({ message: "Failed to delete allergen. Please try again later." });
  }
});

// MealPlanner GET with email filter
app.get('/api/mealPlanner', async (req, res) => {
  const { email } = req.query;
  try {
    if (!email) {
      return res.status(400).json({ message: "Email is required to fetch meal plans." });
    }
    const meals = await db.collection('mealPlanner').find({ email }).toArray();
    res.json(meals);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// MealPlanner POST
app.post('/api/mealPlanner', async (req, res) => {
  try {
    const meal = req.body;
    if (!meal.email) {
      return res.status(400).json({ message: "Email is required." });
    }
    await db.collection('mealPlanner').insertOne(meal);
    res.status(201).json(meal);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Profile Routes
app.get('/api/profile', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }
    const profile = await db.collection('profile').findOne({ email });
    if (!profile) {
      return res.status(404).json({ message: "Profile not found." });
    }
    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Profile POST
app.post('/api/profile', async (req, res) => {
  try {
    const profile = req.body;
    if (!profile.email) {
      return res.status(400).json({ message: "Email is required." });
    }

    await db.collection('profile').replaceOne(
      { email: profile.email },  // Filter by email
      profile,                   // Replace or insert this profile
      { upsert: true }           // Upsert option ensures the document is inserted if not found
    );

    res.status(201).json(profile);
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({ message: "A profile with this email already exists." });
    } else {
      res.status(400).json({ message: error.message });
    }
  }
});

// Check if profile details exist
app.get('/api/hasdetails', async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  try {
    const profile = await db.collection('profile').findOne({ email });

    if (profile) {
      return res.json({ exists: true });
    } else {
      return res.json({ exists: false });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// File upload for scanning food
app.post('/api/scanfood', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }

    // Create a new FormData instance
    const form = new FormData();

    // Append the file buffer to the form data
    form.append('file', req.file.buffer, {
      filename: req.file.originalname, // Use the original file name
      contentType: req.file.mimetype,  // Use the file's MIME type
    });

    // Upload the file to envs.sh
    const response = await axios.post('https://envs.sh', form, {
      headers: {
        ...form.getHeaders(), // Include the form-data headers
      },
    });

    if (response.status !== 200) {
      return res.status(500).json({ message: "Error uploading file to envs.sh" });
    }

    // Extract the URL from the response and ensure it includes the protocol
    const fileUrl = `https://envs.sh/${response.data.replace('\n', '').replace('https://envs.sh/', '')}`;

    // Send the URL back to the client
    res.status(200).json({ url: fileUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error processing file upload" });
  }
});

app.post('/api/uploadImage', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }

    // Create a new FormData instance
    const form = new FormData();

    // Append the file buffer to the form data
    form.append('file', req.file.buffer, {
      filename: req.file.originalname, // Use the original file name
      contentType: req.file.mimetype,  // Use the file's MIME type
    });

    // Upload the file to envs.sh
    const response = await axios.post('https://envs.sh', form, {
      headers: {
        ...form.getHeaders(), // Include the form-data headers
      },
    });

    if (response.status !== 200) {
      return res.status(500).json({ message: "Error uploading file to envs.sh" });
    }

    // Extract the URL from the response and ensure it includes the protocol
    const fileUrl = `https://envs.sh/${response.data.replace('\n', '').replace('https://envs.sh/', '')}`;

    // Send the URL back to the client
    res.status(200).json({ url: fileUrl });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ message: "Error processing file upload" });
  }
});

app.post('/api/foodlog', async (req, res) => {
  try {
    const { 
      email, 
      dishName, 
      calories, 
      protein,       // Added protein
      carbs,         // Added carbs
      fat,           // Added fat
      ingredients, 
      servingSize, 
      healthiness 
    } = req.body;

    // Updated validation check
    if (!email || !dishName || !calories || !protein || !carbs || !fat || !ingredients || !servingSize || !healthiness) {
      return res.status(400).json({ message: "All fields are required." });
    }

    await db.collection('foodLog').insertOne({
      email,
      dishName,
      calories: Number(calories),
      protein: Number(protein),
      carbs: Number(carbs),
      fat: Number(fat),
      ingredients,
      servingSize,
      healthiness,
      timestamp: new Date(),
    });

    res.status(201).json({ message: "Food log saved successfully." });
  } catch (error) {
    console.error('Error saving food log:', error);
    res.status(500).json({ message: "Failed to save food log. Please try again later." });
  }
});

// Modified FoodLog GET endpoint
app.get('/api/foodlog', async (req, res) => {
  const { email } = req.query;
  try {
    if (!email) {
      return res.status(400).json({ message: "Email is required to fetch food logs." });
    }
    const foodLogs = await db.collection('foodLog')
      .find({ email })
      .sort({ timestamp: -1 })  // Newest first
      .toArray();
      
    // Transform data for frontend
    const transformed = foodLogs.map(log => ({
      ...log,
      id: log._id.toString(),
      timestamp: log.timestamp.toISOString()
    }));
    
    res.json(transformed);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Enhanced Weekly Calories endpoint
app.get('/api/weeklycalo', async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  try {
    const weeklyData = await db.collection('foodLog').aggregate([
      {
        $match: {
          email: email // Only filter by email, no date restriction
        }
      },
      {
        $addFields: {
          // Extract date parts in UTC
          date: {
            $dateFromParts: {
              year: { $year: "$timestamp" },
              month: { $month: "$timestamp" },
              day: { $dayOfMonth: "$timestamp" },
              timezone: "UTC"
            }
          }
        }
      },
      {
        $group: {
          _id: {
            dayOfWeek: { 
              $dayOfWeek: {
                date: "$date",
                timezone: "UTC"
              }
            }
          },
          totalCalories: { $sum: "$calories" },
          totalProtein: { $sum: "$protein" }, // Changed to sum instead of avg
          totalCarbs: { $sum: "$carbs" },    // Changed to sum instead of avg
          totalFat: { $sum: "$fat" }         // Changed to sum instead of avg
        }
      },
      {
        $project: {
          _id: 0,
          dayOfWeek: "$_id.dayOfWeek",
          calories: "$totalCalories",
          protein: { $round: ["$totalProtein", 0] },
          carbs: { $round: ["$totalCarbs", 0] },
          fat: { $round: ["$totalFat", 0] }
        }
      }
    ]).toArray();

    // Map to all days of week
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const result = days.map((day, index) => {
      const dayNumber = index + 1;
      const data = weeklyData.find(d => d.dayOfWeek === dayNumber);
      
      return {
        day,
        calories: data?.calories || 0,
        protein: data?.protein || 0,
        carbs: data?.carbs || 0,
        fat: data?.fat || 0
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching weekly data:', error);
    res.status(500).json({ message: "Failed to fetch weekly data" });
  }
});
// Server Listening
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));