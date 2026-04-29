"use client";
import { AppDispatch } from "@/redux/store";
import { setUserData } from "@/redux/userSlice";
import axios from "axios";
import React, { useEffect } from "react";
import { useDispatch } from "react-redux";

function UseGetCurrentUser() {
  const dispatch = useDispatch<AppDispatch>();
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const result = await axios.get("/api/user/currentUser");
        dispatch(setUserData(result.data));
      } catch (error) {
        console.log(error);
        dispatch(setUserData(null));
      }
    };
    fetchUser();
  }, []);
}

export default UseGetCurrentUser;
