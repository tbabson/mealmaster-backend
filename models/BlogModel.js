// Blog Model (mongoose model example)
import mongoose from 'mongoose';

const CommentSchema = new mongoose.Schema({
    content: {
        type: String,
        required: [true, 'Comment content is required'],
    },
    user: {
        type: mongoose.Types.ObjectId,
        ref: 'User',
        required: [true, 'Comment must belong to a user'],
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const BlogSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Blog title is required'],
        trim: true,
        maxlength: [100, 'Title cannot be more than 100 characters'],
    },
    metaTitle: {
        type: String,
        maxlength: [60, 'Meta title should not exceed 60 characters'],
    },
    metaDescription: {
        type: String,
        maxlength: [160, 'Meta description should not exceed 160 characters'],
    },
    slug: {
        type: String,
        unique: true,
    },
    keywords: [{
        type: String,
    }],
    content: {
        type: String,
        required: [true, 'Blog content is required'],
    },
    featuredImage: {
        type: String,
        required: [true, 'Featured image is required'],
    },
    featuredImageAlt: {
        type: String,
        required: [true, 'Image alt text is required for accessibility and SEO'],
    },
    cloudinaryId: {
        type: String,
    },
    author: {
        type: mongoose.Types.ObjectId,
        ref: 'User',
        required: [true, 'Blog must have an author'],
    },
    category: {
        type: String,
        required: [true, 'Blog category is required'],
        enum: ['General', 'Recipes', 'Nutrition', 'Cooking Tips', 'Health', 'Other'],
    },
    tags: [{
        type: String,
    }],
    comments: [CommentSchema],
    status: {
        type: String,
        enum: ['draft', 'published'],
        default: 'published',
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Method to find related articles based on category and keywords
BlogSchema.statics.findRelated = async function (blogId, limit = 3) {
    const blog = await this.findById(blogId);
    if (!blog) return [];

    return this.find({
        _id: { $ne: blogId },
        status: 'published',
        $or: [
            { category: blog.category },
            { keywords: { $in: blog.keywords } }
        ]
    })
        .sort('-createdAt')
        .limit(limit)
        .populate('author', 'fullName');
};

// Drop any existing slug index if it exists
BlogSchema.pre('save', async function () {
    try {
        await this.collection.dropIndex('slug_1');
    } catch (error) {
        // Index might not exist, ignore error
    }
});

const Blog = mongoose.model('Blog', BlogSchema);

export default Blog;