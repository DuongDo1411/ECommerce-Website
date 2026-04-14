import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
    try {
        await connectDB();
        const admin = await User.findOne({role: "admin"});
        return NextResponse.json({
            exists: !!admin,   
        })
    } catch (error) {
        return NextResponse.json({
            error: `check-admin error ${error}`,
        }, {status: 500})
    }
}