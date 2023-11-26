import "dotenv/config";
import express, { query } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import cookieSession from "cookie-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import pg from "pg";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";

const db = new pg.Client({
  user: "postgres",
  password: "BcfAEgG1D*Bgc5GdD*bA5D3*1ACgGCF1",
  host: "monorail.proxy.rlwy.net",
  database: "railway",
  port: 29000,
});


db.connect();

const app = express();

const saltRounds = 10;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json({limit:'50mb'}));
app.use(
  cors({
    origin: "http://localhost:8000",
    methods: "GET,POST,PUT,DELETE",
    credentials: true,
  })
);

app.use(
  cookieSession({
    name: "session",
    keys: [process.env.SECRET],
    maxAge: 24 * 60 * 60 * 1000,
  })
);

passport.use(
  "googleAuth",
  new GoogleStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      // done(null, { id: 1, name: "Aditya" });
      try {
        const text = "select * from user_yelpcamp where profile_id=$1";
        const value = [profile.id];
        const result = await db.query(text, value);
        if (result.rows.length == 0) {
          const text =
            "insert into user_yelpcamp(name,profile_id,photo) values($1,$2,$3) RETURNING *";
          const value = [
            profile.displayName,
            profile.id,
            profile.photos[0].value,
          ];
          const result = await db.query(text, value);
          if (result.rows.length > 0) {
            done(null, result.rows[0]);
          } else {
            done(null, false, { message: "User not authenticated" });
          }
        } else {
          done(null, result.rows[0]);
        }
      } catch (error) {
        done(error);
      }
    }
  )
);

passport.use(
  "local",
  new LocalStrategy(
    { usernameField: "username", passwordField: "password" },
    async (username, password, done) => {
      try {
        const text = "select * from user_yelpcamp where name=$1";
        const value = [username];
        const result = await db.query(text, value);
        if (result.rows.length > 0) {
          const flag = await bcrypt.compare(password, result.rows[0].password);
          if (flag) {
            done(null, result.rows[0]);
          } else {
            done(null, false, { message: "Password is incorrect" });
          }
        } else {
          done(null, false, { message: "Username is incorrect" });
        }
      } catch (error) {
        done(error);
      }
    }
  )
);

passport.use(
  "local_register",
  new LocalStrategy(
    { usernameField: "username", passwordField: "password" },
    async (username, password, done) => {
      try {
        const hash = await bcrypt.hash(password, saltRounds);
        const text =
          "insert into user_yelpcamp(name,password) values ($1,$2) RETURNING *";
        const value = [username, hash];
        const result = await db.query(text, value);
        if (result.rows.length > 0) {
          done(null, result.rows[0]);
        } else {
          done(null, false, { message: "Username already exists" });
        }
      } catch (error) {
        done(error);
      }
    }
  )
);

passport.serializeUser(function (user, done) {
  done(null, user["id"]);
});

passport.deserializeUser(async function (id, done) {
  try {
    const text = "select * from user_yelpcamp where id=$1";
    const value = [id];
    const result = await db.query(text, value);
    if (result.rows.length > 0) {
      done(null, result.rows[0]);
    } else {
      done(null, false, { message: "User not found" });
    }
  } catch (error) {
    throw error;
  }
});

app.use(passport.initialize());
app.use(passport.session());

app.get("/auth/login/success", (req, res) => {
  if (req.isAuthenticated()) {
    res.status(200).json({
      success: true,
      message: "Success",
      user: req.user,
    });
  }
});

app.get("/auth/login/failed", (req, res) => {
  res.status(401).json({
    success: false,
    message: "failure",
  });
});

app.get(
  "/auth/google",
  passport.authenticate("googleAuth", { scope: ["profile"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("googleAuth", {
    failureRedirect: "/login/failed",
  }),
  (req, res) => {
    res.redirect(process.env.CLIENT_URL);
  }
);

app.post(
  "/auth/local/login",
  passport.authenticate("local", {
    failureRedirect: "/auth/login/failed",
  }),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: "Success",
      user: req.user,
    });
  }
);

app.post(
  "/auth/local/register",
  passport.authenticate("local_register", {
    failureRedirect: "/auth/login/failed",
  }),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: "Success",
      user: req.user,
    });
  }
);

app.get("/auth/logout", (req, res) => {
  req.logout();
  res.redirect(process.env.CLIENT_URL);
});


///////////////////////////////////////////CRUD//////////////////////////////////////////////////////
app.get("/name/:id",async(req,res)=>{
  try {
    const text = "select name from user_yelpcamp where id=$1";
    const result = await db.query(text,[req.params.id]);
    res.status(200).json({
      success:true,
      result:result.rows[0].name
    })
  } catch (error) {
    console.log(error)
  }
})
app.get("/fetch/all",async(req,res)=>{
  try {
    let text = "select * from campground"
    let result = await db.query(text,[]);
    result = await Promise.all(result.rows.map(async (item)=>{
      text = "select image from campground_info where cid=$1 limit 1"
      const result1 = await db.query(text,[item.id]);
      return {...item,...result1.rows[0]};
    }))
    res.status(200).json({
      success:true,
      result:result
    });
  } catch (error) {
    console.log(error);
  }
})
app.get("/fetch/info/comment/:id",async(req,res)=>{
  try {
    const text = "select * from user_comment where info_id=$1";
    const result = await db.query(text,[req.params.id]);
    if(result.rows.length>0){
      res.status(200).json({
        success:true,
        result:result.rows
      })
    }else {
      res.status(500).json({
        success:false
      })
    }
  } catch (error) {
    console.log(error);
  }
})

app.get("/fetch/total/info/:id",async(req,res)=>{
  try {
    const text = "select * from campground_info where cid=$1";
    const value = [req.params.id];
    const result = await db.query(text,value);
    res.status(200).json({
      count:result.rows.length
    })
    
  } catch (error) {
    console.log(error);
  }
})
app.get("/fetch/info/:id/:type",async(req,res)=>{
  try {
    const id = Number(req.params.id);
    const type = Number(req.params.type);
    let text = "SELECT * FROM ( SELECT *, ROW_NUMBER() OVER (ORDER BY id) AS RowNum FROM campground_info where cid=$1) AS sub WHERE RowNum = $2";
    let result = await db.query(text,[id,type]);

    text = "select title from campground where id=$1";
    const result1 = await db.query(text,[id]);

    if(result.rows.length>0){
      result = {...result.rows[0],name:result1.rows[0].title}
    
      res.status(200).json({
        success: true,
        result: result
      });
    }else {
      res.status(500).json({
        success: false,
      });
    }
    
  } catch (error) {
    console.log(error);
  }
})

app.get("/fetch/:id",async(req,res)=>{
  try {
    let text = "select * from campground where id in (select cid from relation where uid=$1)"
    let result = await db.query(text,[req.params.id]);
    result = await Promise.all(result.rows.map(async (item)=>{
      text = "select image from campground_info where cid=$1 and uid=$2 limit 1"
      const result1 = await db.query(text,[item.id,req.params.id]);
      return {...item,...result1.rows[0]};
    }))
    res.status(200).json({
      success:true,
      result:result
    });
    
  } catch (error) {
    console.log(error);
  }
});

//3
app.post("/new/info/:id/:uid",async (req,res)=>{
  try {
    const text = "insert into campground_info(cid,image,content,uid) values($1,$2,$3,$4)";
    const value = [req.params.id,JSON.stringify(req.body.image) ,req.body.content,req.params.uid];
    await db.query(text,value);
    res.status(200).json({
      success: true,
    });

  } catch (error) {
    console.log(error);
  }
})

app.post("/new/campground", async (req, res) => {
  try {
    let text = "insert into campground(title) values($1) returning *";
    let value = [req.body.title];
    const result = await db.query(text,value);

    text = "insert into campground_info(cid,image,content,uid) values($1,$2,$3,$4)"
    value = [result.rows[0].id ,JSON.stringify(req.body.image) ,req.body.content,req.body.uid]
    await db.query(text,value);

    if (result.rows.length > 0) {
      text = "insert into relation(uid,cid) values($1,$2) returning *";
      value = [req.body.uid, result.rows[0].id];
      const result1 = await db.query(text, value);
      if (result1.rows.length > 0) {
        res.status(200).json({
          success: true,
          result:result.rows[0].id
        });
      } else {
        res.status(500).json({
          success: false,
        });
      }
    } else {
      res.status(500).json({
        success: false,
      });
    }

  } catch (error) {
    console.log(error);
  }
});



app.post("/new/comment/info",async(req,res)=>{
  try {
    const text = "insert into user_comment(info_id,comment_date,comment,uid,name) values($1,$2,$3,$4,$5) returning *"
    const value = [req.body.infoId,new Date(),req.body.comment,req.body.uid,req.body.name];
    const result = await db.query(text,value);
    if(result.rows.length>0){
      res.status(200).json({
        success:true,
        result:result.rows[0]
      })
    }else{
      res.status(500).json({
        success:false
      })
    }
    
  } catch (error) {
    console.log(error);
  }
})

//2
app.put("/edit/info/:infoId/:id",async(req,res)=>{
  try {
    let text = "update campground set title=$1 where id=$2"
    let value = [req.body.name,req.params.id];
    await db.query(text,value);
    text = "update campground_info set image=$1, content=$2 where id=$3";
    value=[JSON.stringify(req.body.image) ,req.body.content,req.params.infoId];
    await db.query(text,value);
    res.status(200).json({
      success: true
    });
  } catch (error) {
    console.log(error);
  }
})

app.put("/edit/comment/info/:id",async(req,res)=>{
  try {
    const text = "update user_comment set comment=$1 where id=$2";
    const value = [req.body.comment,req.params.id];
    const result = await db.query(text,value);
    res.status(200).json({
      success: true
    });
  } catch (error) {
    console.log(error);
  }
})

app.delete("/delete/info/:infoId/:id/:uid",async(req,res)=>{
  try {
    let text = "delete from user_comment where info_id=$1"
    let value = [req.params.infoId];
    await db.query(text,value);
    text = "delete from campground_info where id=$1";
    value = [req.params.infoId];
    await db.query(text,value);
    text = "select * from campground_info where cid=$1";
    value = [req.params.id];
    const result = await db.query(text,value);

    if(result.rows.length == 0){
      text = "delete from relation where uid=$1 and cid=$2";
      value = [req.params.uid,req.params.id];
      await db.query(text,value);
      text = "delete from campground where id=$1";
      value = [req.params.id];
      await db.query(text,value);
      res.status(200).json({
        isEmpty: true
      });

    } else {
      res.status(200).json({
        isEmpty: false 
      });
    }

  } catch (error) {
    console.log(error);
  }
})

app.delete("/delete/comment/:id",async(req,res)=>{
  try {
    const text = "delete from user_comment where id=$1";
    await db.query(text,[req.params.id]);
    res.status(200).json({
      success: true
    });
  } catch (error) {
    console.log(error);
  }
})

app.listen(process.env.PORT, () => {
  console.log("Server Started at " + process.env.PORT);
});
