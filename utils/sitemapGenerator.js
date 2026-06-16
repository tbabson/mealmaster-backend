import { SitemapStream, streamToPromise } from 'sitemap';
import { Readable } from 'stream';
import Blog from '../models/BlogModel.js';
import Meal from '../models/MealModel.js';

export const generateSitemap = async (baseURL) => {
    try {
        // Fetch all published blog posts
        const blogs = await Blog.find({ status: 'published' }).select('slug updatedAt').lean();

        // Fetch all published meals
        const meals = await Meal.find({}).select('_id updatedAt').lean();

        // Define static routes
        const staticRoutes = [
            { url: '/', changefreq: 'daily', priority: 1 },
            { url: '/meals', changefreq: 'daily', priority: 0.9 },
            { url: '/blog', changefreq: 'daily', priority: 0.9 },
            { url: '/about', changefreq: 'monthly', priority: 0.5 },
            { url: '/contact', changefreq: 'monthly', priority: 0.5 }
        ];

        // Create sitemap stream
        const stream = new SitemapStream({ hostname: baseURL });

        // Add all routes to the stream
        return streamToPromise(
            Readable.from([
                ...staticRoutes,
                ...blogs.map(blog => ({
                    url: `/blog/${blog.slug}`,
                    changefreq: 'weekly',
                    priority: 0.8,
                    lastmod: blog.updatedAt
                })),
                ...meals.map(meal => ({
                    url: `/meals/${meal._id}`,
                    changefreq: 'weekly',
                    priority: 0.8,
                    lastmod: meal.updatedAt
                }))
            ]).pipe(stream)
        ).then(data => data.toString());
    } catch (error) {
        console.error('Error generating sitemap:', error);
        throw error;
    }
};