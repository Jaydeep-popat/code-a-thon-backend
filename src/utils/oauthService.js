import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { User } from '../models/user.model.js';
import { ApiError } from './apiError.js';

/**
 * Configure Passport with OAuth strategies
 */
export const configurePassport = () => {
  // Serialize user to session
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

  // Configure Google OAuth Strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
        scope: ['profile', 'email']
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Check if user already exists with this Google ID
          let user = await User.findOne({ providerId: profile.id, provider: 'google' });
          
          // If user doesn't exist, check if their email is already registered
          if (!user) {
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(new ApiError(400, "Email not provided by Google"), null);
            }
            
            // Check if a user with this email already exists
            const existingUser = await User.findOne({ email });
            
            if (existingUser) {
              // If user exists but doesn't have Google as provider, link accounts
              if (!existingUser.provider) {
                existingUser.provider = 'google';
                existingUser.providerId = profile.id;
                existingUser.providerData = profile;
                existingUser.isVerified = true; // Auto-verify OAuth users
                await existingUser.save();
                return done(null, existingUser);
              } else {
                // User already exists with another provider
                return done(null, existingUser);
              }
            }
            
            // Create new user if they don't exist
            const username = `user_${Math.floor(Math.random() * 10000)}`;
            
            user = await User.create({
              fullName: profile.displayName,
              email: email,
              username: username,
              provider: 'google',
              providerId: profile.id,
              providerData: profile,
              isVerified: true // Auto-verify OAuth users
            });
          }
          
          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
  
  // Configure GitHub OAuth Strategy
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: process.env.GITHUB_CALLBACK_URL,
        scope: ['user:email']
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Check if user already exists with this GitHub ID
          let user = await User.findOne({ providerId: profile.id, provider: 'github' });
          
          // If user doesn't exist, check if their email is already registered
          if (!user) {
            // GitHub may not expose email by default, get it from the emails array
            const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
            
            if (!email) {
              return done(new ApiError(400, "Email not provided by GitHub. Please make sure your email is public in GitHub settings."), null);
            }
            
            // Check if a user with this email already exists
            const existingUser = await User.findOne({ email });
            
            if (existingUser) {
              // If user exists but doesn't have GitHub as provider, link accounts
              if (!existingUser.provider) {
                existingUser.provider = 'github';
                existingUser.providerId = profile.id;
                existingUser.providerData = profile;
                existingUser.isVerified = true; // Auto-verify OAuth users
                await existingUser.save();
                return done(null, existingUser);
              } else {
                // User already exists with another provider
                return done(null, existingUser);
              }
            }
            
            // Create new user if they don't exist
            const username = `user_${Math.floor(Math.random() * 10000)}`;
            
            user = await User.create({
              fullName: profile.displayName || profile.username,
              email: email,
              username: profile.username || username,
              provider: 'github',
              providerId: profile.id,
              providerData: profile,
              isVerified: true // Auto-verify OAuth users
            });
          }
          
          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
};

/**
 * Handle OAuth callback and generate JWT tokens
 * @param {Object} user - User object
 */
export const handleOAuthCallback = async (user) => {
  try {
    // Generate access and refresh tokens
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    
    // Save refresh token to user
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    
    return { user, accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating tokens after OAuth login"
    );
  }
};
