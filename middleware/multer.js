import multer from "multer"; // Middleware to handle file uploads


// const storage = multer.diskStorage({
//     filename: (req, file, cb) => {
//         cb(null, `${Date.now()}-${file.originalname}`);
//     },
// });


// const upload = multer({ storage });


//Multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads'); // Define upload directory
    },
    filename: (req, file, cb) => {
        const fileName = `${Date.now()}-${file.originalname}`
        // Define unique filename using timestamp and original name
        cb(null, fileName);
    },
});

// File type validation filter
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
        return cb(new Error('Only JPEG, JPG, PNG, and WEBP files are allowed'), false);
    }
    cb(null, true); // Accept file
};




// Initialize Multer with the storage configuration
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 1080 * 1080 }, // Optional: Set file size limit (5 MB in this case)
});



export default upload;