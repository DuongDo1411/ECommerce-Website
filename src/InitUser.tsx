"use client";
import UseGetAllProducts from "./hooks/UseGetAllProductsData";
import UseGetCurrentUser from "./hooks/UseGetCurrentUser";
import UseGetAllVendors from "./hooks/UserGetAllVendors";

function InitUser() {
  UseGetCurrentUser();
  UseGetAllVendors();
  UseGetAllProducts();
  return null;
}

export default InitUser;
