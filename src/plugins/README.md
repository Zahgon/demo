# Plugins Folder

Plugins define behavior that is common to all the routes in your application. Authentication, caching, templates, and all the other cross cutting concerns should be handled by plugins placed in this folder.

Files in this folder export a function that receives the application instance and installs middleware on it. They can add properties to the application and register middleware that will then be used in the rest of your application.

Check out:

- [Writing Express middleware](https://expressjs.com/en/guide/writing-middleware.html)
- [Using Express middleware](https://expressjs.com/en/guide/using-middleware.html).
- [Express application settings](https://expressjs.com/en/4x/api.html#app.settings.table).
