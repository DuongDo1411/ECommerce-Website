"use client";
import axios from "axios";
import React, { useEffect } from "react";
import { useDispatch } from "react-redux";
import { AppDispatch } from "@/redux/store";
import { setAllVendorData } from "@/redux/vendorSlice";

function UseGetAllVendors() {
  const dispatch = useDispatch<AppDispatch>();
  useEffect(() => {
    const fetchAllVendor = async () => {
      try {
        const result = await axios.get("/api/vendor/AllVendor");
        dispatch(setAllVendorData(result.data.vendors));
      } catch (error) {
        console.log(error);
        dispatch(setAllVendorData([]));
      }
    };
    fetchAllVendor();
  }, []);
}

export default UseGetAllVendors;
