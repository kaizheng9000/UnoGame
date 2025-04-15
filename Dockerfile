FROM node:20

# Set the working directory
WORKDIR /app

# Copy package.json and yarn.lock first
# This ensures that Docker installs dependencies based on these files
COPY package.json yarn.lock ./

# Install dependencies (no node_modules from local machine)
RUN yarn install --frozen-lockfile

# Copy the rest of the application files
COPY . .

# Expose the port for the app
EXPOSE 5000

# Run the application
CMD ["yarn", "dev"]
