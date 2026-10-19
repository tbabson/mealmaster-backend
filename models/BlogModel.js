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
        // sparse: legacy posts without a slug must not collide on null
        unique: true,
        sparse: true,
        trim: true,
        lowercase: true,
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

export const slugify = (text) =>
    String(text || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);

// Give every post a unique slug (previously the slug index was dropped on
// every save to dodge duplicate-null errors, which disabled uniqueness entirely).
BlogSchema.pre('validate', async function () {
    if (this.slug && !this.isModified('slug')) return;

    const base = slugify(this.slug || this.title) || 'post';
    let candidate = base;
    let attempt = 1;
    while (await this.constructor.exists({ slug: candidate, _id: { $ne: this._id } })) {
        attempt += 1;
        candidate = `${base}-${attempt}`;
    }
    this.slug = candidate;
});

const Blog = mongoose.model('Blog', BlogSchema);

export default Blog;