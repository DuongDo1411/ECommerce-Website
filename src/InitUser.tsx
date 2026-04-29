"use client";
import UseGetCurrentUser from "./hooks/UseGetCurrentUser";
import UseGetAllVendors from "./hooks/UserGetAllVendors";

function InitUser() {
  UseGetCurrentUser();
  UseGetAllVendors();
  return null;
}

export default InitUser;
