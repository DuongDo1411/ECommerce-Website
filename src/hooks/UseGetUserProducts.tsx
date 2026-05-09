"use client";
import axios from "axios";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { AppDispatch } from "@/redux/store";
import { setAllProductsData } from "@/redux/vendorSlice";

function UseGetUserProducts() {
  const dispatch = useDispatch<AppDispatch>();
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const result = await axios.get("/api/user/products");
        dispatch(setAllProductsData(result.data));
      } catch (error) {
        console.log(error);
        dispatch(setAllProductsData([]));
      }
    };
    fetchProducts();
  }, [dispatch]);
}

export default UseGetUserProducts;
