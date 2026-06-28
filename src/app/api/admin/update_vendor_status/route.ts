import connectDB from "@/lib/connectDB";
import { requireRole } from "@/lib/rbac";
import User from "@/model/user.model";
import { NextRequest, NextResponse } from "next/server";


export async function POST(req: NextRequest) {
    try {
        await connectDB();
        const authz = await requireRole(["admin"], { mode: "api" });
        if (authz instanceof NextResponse) return authz;
        const {vendorId , status , rejectedReason} = await req.json()
        if(!vendorId || !status){
            return NextResponse.json(
                {message:"Vendor ID and status are required"},
                {status:400}
            ) 
        }
        
        const vendor = await User.findById(vendorId);
        if(!vendor){
            return NextResponse.json({message:"Vendor not found"},{status:404})
        }

        if(status === "approved"){
            vendor.verificationStatus = "approved";
            vendor.isApproved = true;
            vendor.approvedAt = new Date();
            vendor.rejectedReason = undefined;
        }

        if(status === "rejected"){
            vendor.verificationStatus = "rejected";
            vendor.isApproved = false;
            vendor.rejectedReason = rejectedReason || "Your application has been rejected by the admin. Please contact admin for more information";
        }

        await vendor.save();
        
        return NextResponse.json({message:"Vendor status updated successfully" , vendor},{status:200})

    } catch (error) {
        return NextResponse.json({message:`Vendor status update error ${error}`},{status:500})
    }
}
