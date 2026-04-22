<<<<<<< HEAD
<<<<<<< HEAD
This repository contains two deployments systems on deploying interactive applications, using the Cube Analysis and Rendering Tool for Astronomy (CARTA) as the use case. We compare the use of Kubernetes as an orchestration framework and Slurm as a resource manager in HPC environment. The objective is to find the best deployment system for interactive applications. For each deployment method we going to list the scripts that needs to be executed. Below is the technical overview of CARTA deployed on both Kubernetes and on HPC using Slurm as a resource manager. 

TECHNICAL OVERVIEW

![Uploading architecture-diagram.png…]()
=======
# Cookies and JWT
=======
# CARTA Server (NodeJS version)

## Work-in-progress, documentation still under construction
>>>>>>> 66deb9d (Update README.md)

Basic example of using JWTs and returning them via cookies. 

To test: 
1. Run `npm install`
2. Copy `config.ts.stub` to `config.ts` and edit if neccessary
3. Run using `npm start`
<<<<<<< HEAD
4. Send a `POST` to `http://localhost:8000/login` with username and password in a JSON body. If the username and password match the dummy values in `config.js`, the server will respond with `{"success": true}`, and a JWT stored as a cookie.
5. Send a `GET` to `http://localhost:8000/test`. The server will verify the JWT sent to it as a cookie, and return `{"success": true}` if it is valid.
>>>>>>> ac208d1 (first commit)
=======
4. Send a `POST` to `http://localhost:8000/login` with username and password in a JSON body. If the username and password match the dummy values in `config.ts`, the server will respond with `{"success": true}`, and a JWT stored as a cookie.
5. Send a `GET` to `http://localhost:8000/checkStatus`. The server will verify the JWT sent to it as a cookie, and return `{"success": true}` if it is valid.
5. Send a `POST` to `http://localhost:8000/start`. The server will
    * Verify the JWT sent to it as a cookie.
    * Kill any existing process spawned for the given user.
    * Attempt to start the process defined in `config.ts` as the user specified in the JWT
    * Return `{"success": true}` if spawning succeeds.
<<<<<<< HEAD
>>>>>>> 1117671 (test of spawning process as user specified by JWT)
=======
>>>>>>> 66deb9d (Update README.md)
